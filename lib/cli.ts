#!/usr/bin/env node
import { Command } from 'commander';
import * as keytar from 'keytar';
import * as inquirer from 'inquirer';
import { sync as readPkgSync } from 'read-pkg';
import { spawn } from 'child_process';
import { userInfo } from 'os';

interface TtyError extends Error {
  isTtyError: boolean;
}

function errorHandler(err: TtyError | Error) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}

function validateEnvironmentVariableKey(input: unknown): boolean {
  return String(input).match(/\w+/) !== null;
}

async function assetEnvVarKeyNotExists(
  credentialsServiceName: string,
  key: string,
) {
  const existing = await keytar.getPassword(credentialsServiceName, key);
  if (existing) {
    throw new Error(`Key "${key}" exists`);
  }
}

async function assetEnvVarKeyExists(
  credentialsServiceName: string,
  key: string,
) {
  const existing = await keytar.getPassword(credentialsServiceName, key);
  if (!existing) {
    throw new Error(`Key "${key}" does not exist`);
  }
}

const { bin, version } = readPkgSync();
const [[name]] = Object.entries(bin as Record<string, string>);
const keyPrefix = `${userInfo().username}@${name}`;
const getCredentialsServiceName = (profile: string) =>
  `${keyPrefix}/${profile}`;
const program = new Command(name);

program.version(version);

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
      await assetEnvVarKeyNotExists(credentialsServiceName, resolvedKey);
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
  .command('del <profile> [key]')
  .alias('delete')
  .alias('remove')
  .alias('erase')
  .description('Delete environment variable <key>')
  .action((profile, key) => {
    const executeDelete = async (resolvedKey: string) => {
      const credentialsServiceName = getCredentialsServiceName(profile);
      await assetEnvVarKeyExists(credentialsServiceName, resolvedKey);
      await keytar.deletePassword(credentialsServiceName, resolvedKey);
    };

    if (key && validateEnvironmentVariableKey(key)) {
      return executeDelete(key).catch(errorHandler);
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
      .then(async (answers) => executeDelete(answers.key))
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
