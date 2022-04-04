#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import inquirer from 'inquirer';
import keytar from 'keytar';
import { spawn } from 'node:child_process';
import { userInfo } from 'node:os';
import { ReadStream } from 'node:tty';
import { fileURLToPath } from 'node:url';
import { readPackageUp } from 'read-pkg-up';

interface TtyError extends Error {
  isTtyError: boolean;
}

function stdout(str: string) {
  process.stdout.write(`${str}\n`);
}

function stderr(str: string) {
  process.stderr.write(`${str}\n`);
}

async function streamToString(stream: ReadStream): Promise<string> {
  if (stream.isTTY) {
    return '';
  }

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function errorHandler(err: TtyError | Error) {
  stderr(err.message);
  process.exitCode = 1;
}

function environmentVariableKeyIsValid(input: unknown): input is string {
  return String(input).match(/\w+/) !== null;
}

async function assertEnvVarKeysNotExist(
  credentialsServiceName: string,
  keys: string[],
) {
  for await (const key of keys) {
    const existing = await keytar.getPassword(credentialsServiceName, key);
    if (existing) {
      throw new Error(`Key "${key}" exists`);
    }
  }
}

function getCredentialsServiceName(packageName: string, profile: string) {
  const keyPrefix = `${userInfo().username}@${packageName}`;
  return `${keyPrefix}/${profile}`;
}

const pkg = await readPackageUp({ cwd: fileURLToPath(import.meta.url) });

if (!pkg?.packageJson.bin || !pkg.packageJson.version) {
  throw new Error('Missing or invalid package.json');
}

const [[packageName]] = Object.entries(
  pkg.packageJson.bin as Record<string, string>,
);

const program = new Command(packageName);

program.version(pkg.packageJson.version);
program.showSuggestionAfterError();

program
  .command('exec <profile> -- <command> [args...]')
  .description('execute a specific command within the profile environment')
  .action(async (profile, command, args) => {
    const credentialsServiceName = getCredentialsServiceName(
      packageName,
      profile,
    );
    const creds = await keytar.findCredentials(credentialsServiceName);
    const env = Object.fromEntries(
      creds.map(({ account, password }) => [account, password]),
    );

    spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
  });

program
  .command('set <profile> [key] [value]')
  .description(
    'Set environment variable [key] with value [value] to the profile',
  )
  .action(async (profile, key, value) => {
    const credentialsServiceName = getCredentialsServiceName(
      packageName,
      profile,
    );

    if (
      typeof key !== 'undefined' &&
      typeof value !== 'undefined' &&
      environmentVariableKeyIsValid(key) &&
      value.length > 0
    ) {
      await assertEnvVarKeysNotExist(credentialsServiceName, [key]);
      return keytar
        .setPassword(credentialsServiceName, key, value)
        .catch(errorHandler);
    }

    await inquirer
      .prompt([
        {
          type: 'string',
          message: 'Enter the environment variable key:',
          name: 'key',
          default: key,
          validate: environmentVariableKeyIsValid,
        },
        {
          type: 'string',
          message: 'Enter the value:',
          name: 'value',
          default: value,
          validate: (val: unknown) => String(val).length > 0,
        },
      ])
      .then(async (answers: { key: string; value: string }) => {
        await assertEnvVarKeysNotExist(credentialsServiceName, [answers.key]);
        await keytar
          .setPassword(credentialsServiceName, answers.key, answers.value)
          .catch(errorHandler);
      })
      .catch(errorHandler);
  });

program
  .command('unset <profile> [key]')
  .description('Unset environment variable <key>')
  .action(async (profile, key) => {
    const executeUnset = async (resolvedKey: string) => {
      const credentialsServiceName = getCredentialsServiceName(
        packageName,
        profile,
      );
      await keytar.deletePassword(credentialsServiceName, resolvedKey);
    };

    if (key && environmentVariableKeyIsValid(key)) {
      return executeUnset(key)
        .then(() => {
          stdout(`${key} unset`);
        })
        .catch(errorHandler);
    }

    await inquirer
      .prompt([
        !key && {
          type: 'string',
          message: 'Enter the environment variable key',
          name: 'key',
          validate: environmentVariableKeyIsValid,
        },
      ])
      .then((answers) => executeUnset(answers.key))
      .catch(errorHandler);
  });

program
  .command('dump <profile>')
  .description('dump the profile environment')
  .action(async (profile) => {
    const credentialsServiceName = getCredentialsServiceName(
      packageName,
      profile,
    );
    const creds = await keytar.findCredentials(credentialsServiceName);

    creds.forEach(({ account: key, password: value }) =>
      stdout(`${key}=${value}`),
    );
  });

program
  .command('slurp <profile>')
  .description('slurp environment variables from STDIN')
  .action(async (profile) => {
    const credentialsServiceName = getCredentialsServiceName(
      packageName,
      profile,
    );

    const input = await streamToString(process.stdin);

    if (!input) {
      program.error('stdin was empty', {
        exitCode: 1,
      });
    }

    const vars = dotenv.parse(input);

    for await (const key of Object.keys(vars)) {
      await assertEnvVarKeysNotExist(credentialsServiceName, [key]);
    }

    for await (const [key, value] of Object.entries(vars)) {
      keytar
        .setPassword(credentialsServiceName, key, value)
        .catch(errorHandler);
      stdout(`${key} set`);
    }
  });

program.parse(process.argv);
