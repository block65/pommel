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
yarn global add pommel
```

## Quick start

Add a secret value to the profile called `development`

```shell script
$ pommel add development SOME_SECRET_ENV_VAR lQwm5L53OEi4wM
```

Execute the command `env` in the profile called `development`

```shell script
$ pommel exec development -- /usr/bin/env
TERM=xterm
USER=user
DISPLAY=:0
...
SOME_SECRET_ENV_VAR=lQwm5L53OEi4wM
```

Chain a command execution of `terraform apply` with pommel profile called
`development` and aws-vault profile `production`

```shell script
$ pommel exec development -- aws-vault exec production -- terraform apply
```

## Usage

```
Usage: pommel [options] [command]

Options:
  -V, --version                       output the version number
  -h, --help                          display help for command

Commands:
  exec <profile> <command> [args...]  execute a specific command within the
                                      profile environment
  add|set <profile> [key] [value]     Add environment variable [key] with
                                      value [value] to the profile
  del|delete <profile> [key]          Delete environment variable <key>
  dump <profile>                      dump the profile environment
  help [command]                      display help for command
```
