#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { userInfo } from 'node:os';
import { ReadStream } from 'node:tty';
import { fileURLToPath } from 'node:url';
import { green, red, bold, blue } from 'colorette';
import dotenv from 'dotenv';
import inquirer from 'inquirer';
import keytar from 'keytar';
import { readPackageUp } from 'read-pkg-up';
import sade from 'sade';

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
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function errorHandler(err: TtyError | Error) {
  stderr(`${bold(red(err.name))} ${err.message}`);
  process.exitCode = 1;
}

function environmentVariableKeyIsValid(input: unknown): input is string {
  return String(input).match(/^\w+$/) !== null;
}

async function assertEnvVarKeysNotExist(
  credentialsServiceName: string,
  keys: string[],
) {
  // eslint-disable-next-line no-restricted-syntax
  for await (const key of keys) {
    const existing = await keytar.getPassword(credentialsServiceName, key);
    if (existing) {
      throw new Error(`${key} exists`);
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

const program = sade(packageName);

program.version(pkg.packageJson.version);

program
  .command('exec <profile> <command> [args...]')
  .describe('execute a specific command within the profile environment')
  .action(async (profile: string, command: string, args: string[] = []) => {
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
  .describe('Set environment variable [key] with value [value] to the profile')
  .action(async (profile: string, userKey?: string, userValue?: string) => {
    const credentialsServiceName = getCredentialsServiceName(
      packageName,
      profile,
    );

    const [key, value] =
      !userValue && userKey?.match(/^\w+=.*/)
        ? userKey.split('=')
        : [userKey, userValue];

    stdout(`${bold('profile')}: ${blue(profile)}`);
    stdout(`${bold('command')}: ${blue('set')}`);

    await inquirer
      .prompt(
        [
          {
            message: 'Key:',
            type: 'string',
            name: 'key',
            validate: environmentVariableKeyIsValid,
          },
          {
            message: (answers) => `Value for ${answers.key}:`,
            type: 'string',
            name: 'value',
            validate: (val: unknown) => String(val).length > 0,
          },
        ],
        { key: environmentVariableKeyIsValid(key) ? key : undefined, value },
      )
      .then(async (answers: { key: string; value: string }) => {
        await assertEnvVarKeysNotExist(credentialsServiceName, [answers.key]);
        await keytar.setPassword(
          credentialsServiceName,
          answers.key,
          answers.value,
        );

        stdout(`${green('OK')}`);
      })
      .catch(errorHandler);
  });

program
  .command('unset <profile> [key]')
  .describe('Unset environment variable <key>')
  .action(async (profile: string, userKey?: string) => {
    stdout(`${bold('profile')}: ${blue(profile)}`);
    stdout(`${bold('command')}: ${blue('unset')}`);

    const key = environmentVariableKeyIsValid(userKey) ? userKey : undefined;

    await inquirer
      .prompt(
        [
          {
            message: 'Key:',
            type: 'string',
            name: 'key',
            default: key,
            validate: environmentVariableKeyIsValid,
            askAnswered: true,
          },
        ],
        {
          key,
        },
      )
      .then(async (answers) => {
        const credentialsServiceName = getCredentialsServiceName(
          packageName,
          profile,
        );
        await keytar.deletePassword(credentialsServiceName, answers.key);

        stdout(`${green('OK')}`);
      })
      .catch(errorHandler);
  });

program
  .command('dump <profile>')
  .describe('dump the profile environment')
  .action(async (profile: string) => {
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
  .describe('slurp environment variables from STDIN')
  .action(async (profile: string) => {
    const credentialsServiceName = getCredentialsServiceName(
      packageName,
      profile,
    );

    const input = await streamToString(process.stdin);

    if (!input) {
      throw new Error('stdin was empty');
    }

    const vars = dotenv.parse(input);

    // eslint-disable-next-line no-restricted-syntax
    for await (const key of Object.keys(vars)) {
      await assertEnvVarKeysNotExist(credentialsServiceName, [key]);
    }

    // eslint-disable-next-line no-restricted-syntax
    for await (const [key, value] of Object.entries(vars)) {
      keytar
        .setPassword(credentialsServiceName, key, value)
        .catch(errorHandler);
      stdout(`${key} set`);
    }
  });

program.parse(process.argv);
