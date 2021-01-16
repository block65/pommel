#!/usr/bin/env node
import { Command } from 'commander';
import * as keytar from 'keytar';
import * as inquirer from 'inquirer';
import { sync as readPkgUpSync } from 'read-pkg-up';
import { spawn } from 'child_process';
import { userInfo } from 'os';

interface TtyError extends Error {
  isTtyError: boolean;
}

function errorHandler(err: TtyError | Error) {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
}

function validateEnvironmentVariableKey(input: unknown): boolean {
  return String(input).match(/\w+/) !== null;
}

async function assertEnvVarKeyNotExists(
  credentialsServiceName: string,
  key: string,
) {
  const existing = await keytar.getPassword(credentialsServiceName, key);
  if (existing) {
    throw new Error(`Key "${key}" exists`);
  }
}

async function assertEnvVarKeyExists(
  credentialsServiceName: string,
  key: string,
) {
  const existing = await keytar.getPassword(credentialsServiceName, key);
  if (!existing) {
    throw new Error(`Key "${key}" does not exist`);
  }
}

const pkg = readPkgUpSync({ cwd: __dirname });

if (!pkg?.packageJson.bin || !pkg.packageJson.version) {
  throw new Error('Missing or invalid package.json');
}

const [[name]] = Object.entries(pkg.packageJson.bin as Record<string, string>);
const keyPrefix = `${userInfo().username}@${name}`;
const getCredentialsServiceName = (profile: string) =>
  `${keyPrefix}/${profile}`;
const program = new Command(name);

program.version(pkg.packageJson.version);

program
  .command('exec <profile> -- <command> [args...]')
  .description('execute a specific command within the profile environment')
  .action((profile, command, args) => {
    const credentialsServiceName = getCredentialsServiceName(profile);
    keytar.findCredentials(credentialsServiceName).then((creds) => {
      const env = Object.fromEntries(
        creds.map(({ account, password }) => [account, password]),
      );

      spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: 'inherit',
      });
    });
  });

program
  .command('add <profile> [key] [value]')
  .alias('set')
  .description(
    'Add environment variable [key] with value [value] to the profile',
  )
  .action((profile, key, value) => {
    const executeSet = async (resolvedKey: string, val: string) => {
      const credentialsServiceName = getCredentialsServiceName(profile);
      await assertEnvVarKeyNotExists(credentialsServiceName, resolvedKey);
      await keytar.setPassword(credentialsServiceName, resolvedKey, val);
    };

    if (
      typeof key !== 'undefined' &&
      typeof value !== 'undefined' &&
      validateEnvironmentVariableKey(key) &&
      value.length > 0
    ) {
      return executeSet(key, value).catch(errorHandler);
    }

    return inquirer
      .prompt([
        {
          type: 'string',
          message: 'Enter the environment variable key:',
          name: 'key',
          default: key,
          validate: validateEnvironmentVariableKey,
        },
        {
          type: 'string',
          message: 'Enter the value:',
          name: 'value',
          default: value,
          validate: (val: unknown) => String(val).length > 0,
        },
      ])
      .then(async (answers: { key: string; value: string }) =>
        executeSet(answers.key, answers.value),
      )
      .catch(errorHandler);
  });

program
  .command('unset <profile> [key]')
  .alias('unset')
  .description('Unset environment variable <key>')
  .action((profile, key) => {
    const executeUnset = async (resolvedKey: string) => {
      const credentialsServiceName = getCredentialsServiceName(profile);
      await assertEnvVarKeyExists(credentialsServiceName, resolvedKey);
      await keytar.deletePassword(credentialsServiceName, resolvedKey);
    };

    if (key && validateEnvironmentVariableKey(key)) {
      return executeUnset(key)
        .then(() => {
          process.stdout.write(`${key} unset\n`);
        })
        .catch(errorHandler);
    }

    return inquirer
      .prompt([
        !key && {
          type: 'string',
          message: 'Enter the environment variable key',
          name: 'key',
          validate: validateEnvironmentVariableKey,
        },
      ])
      .then(async (answers) => executeUnset(answers.key))
      .catch(errorHandler);
  });

program
  .command('dump <profile>')
  .description('dump the profile environment')
  .action((profile) => {
    const credentialsServiceName = getCredentialsServiceName(profile);
    keytar.findCredentials(credentialsServiceName).then((creds) => {
      creds.forEach(({ account, password }) =>
        process.stdout.write(`${account}=${password}\n`),
      );
    });
  });

program.parse(process.argv);
