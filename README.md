# Pommel

A tool to securely store and access sensitive environment variables in
a development environment. Pommel stores these values in your operating system's
secure keystore.

Sensitive environment variables are only populated when you intentionally
invoke `pommel exec` and they are therefore safely hidden away from your
everyday command line usage.

Inspired by [aws-vault](https://github.com/99designs/aws-vault)

## Installing

```shell script
yarn global add @block65/pommel
```

```shell script
npm install --global @block65/pommel
```

## Quick start

### Setting values

Set a value in the profile called `prod`

```shell script
$ pommel set prod SOME_SECRET_ENV_VAR QGJsb2NrNjUvcG9tbWVs
```

### Executing commands

Execute the command `/usr/bin/env` in the profile called `prod`

```shell script
$ pommel exec prod -- /usr/bin/env
TERM=xterm
USER=user
DISPLAY=:0
...
SOME_SECRET_ENV_VAR=QGJsb2NrNjUvcG9tbWVs
```

### Chaining commands

Execute the command `terraform apply` with profile called `prod` and then, `aws-vault` with profile `prod`

```shell script
$ pommel exec prod -- aws-vault exec prod -- terraform apply
```

## Usage

```
Usage: pommel [options] [command]

Options:
  -V, --version                            output the version number
  -h, --help                               display help for command

Commands:
  exec <profile> <--> <command> [args...]  execute a specific command within the profile environment
  set <profile> [key] [value]              Set environment variable [key] with value [value] to the
                                           profile
  unset <profile> [key]                    Unset environment variable <key>
  dump <profile>                           dump the profile environment
  slurp <profile>                          slurp environment variables from STDIN
  help [command]                           display help for command
```
