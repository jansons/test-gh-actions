#!/usr/bin/env node

import util from 'util'
import { context, getOctokit } from '@actions/github'

const exec = util.promisify(require('child_process').exec)

type LogGroup = 'Features' | 'Fixes' | 'Dependencies' | 'Internal'
type ParsedLine = { type?: LogGroup; log: string }

function parseLine(line: string): ParsedLine {
  const splitIdx = line.indexOf(':')

  if (splitIdx !== -1) {
    const type = logType(line.substring(0, splitIdx))
    const log = capitalizeFirst(line.substring(splitIdx + 1).trim())

    return { type, log }
  }

  return { type: 'Internal', log: capitalizeFirst(line) }
}

function logType(prefix: string): LogGroup | undefined {
  switch (prefix) {
    case 'feat':
      return 'Features'
    case 'fix':
      return 'Fixes'
    case 'deps':
    case 'chore(deps)':
      return 'Dependencies'
    case 'chore(release)':
      return undefined
    default:
      return 'Internal'
  }
}

function capitalizeFirst(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1)
}

function linkDeps(log: string): string {
  const matches = log.match(
    /^Update (Alpha|Beta|Omega) to v?([0-9]+\.[0-9]+\.[0-9]+)$/,
  )

  if (!matches) {
    // Log didn't match the expected format, ignore it
    return log
  }

  const name = matches[1]
  const version = matches[2]

  let releaseUrl
  switch (name) {
    case 'Alpha':
      releaseUrl = `https://github.com/jansons/alpha-repo/releases/tag/v${version}`
      break
    case 'Beta':
      releaseUrl = `https://github.com/jansons/beta-repo/releases/tag/v${version}`
      break
    case 'Omega':
      releaseUrl = `https://github.com/jansons/omega-repo/releases/tag/v${version}`
      break
    default:
      // No linking support for this dependency
      return log
  }

  return `Update ${name} to [${version}](${releaseUrl})`
}

async function getCommits(): Promise<ParsedLine[]> {
  try {
    const { stdout } = await exec(
      'git log --pretty=format:%s $(git describe --tags --abbrev=0 HEAD^)..',
    )

    return stdout
      .split('\n')
      .map(parseLine)
      .filter((line: ParsedLine) => !!line.type)
  } catch (err) {
    console.error(err)
    return []
  }
}

function markdownChangelog(lines: ParsedLine[]): string {
  let body = []

  const features = lines.filter((x) => x.type === 'Features')
  if (features.length) {
    body.push('## Features')
    features.forEach(({ log }) => body.push(log))
    body.push('')
  }

  const fixes = lines.filter((x) => x.type === 'Fixes')
  if (fixes.length) {
    body.push('## Fixes')
    fixes.forEach(({ log }) => body.push(log))
    body.push('')
  }

  const deps = lines.filter((x) => x.type === 'Dependencies')
  if (deps.length) {
    body.push('## Dependencies')
    deps.forEach(({ log }) => body.push(linkDeps(log)))
    body.push('')
  }

  const internal = lines.filter((x) => x.type === 'Internal')
  if (internal.length) {
    body.push('## Internal')
    internal.forEach(({ log }) => body.push(log))
    body.push('')
  }

  return body.join('\n').trim()
}

async function run(): Promise<void> {
  if (!process.env.GITHUB_REF) {
    throw new Error('No GITHUB_REF provided')
  }
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('No GITHUB_TOKEN provided')
  }

  const lines = await getCommits()
  const changelog = markdownChangelog(lines)
  // console.log(changelog)

  const {
    repo: { owner, repo },
  } = context

  const tagName = process.env.GITHUB_REF.replace('refs/tags/', '')

  await getOctokit(process.env.GITHUB_TOKEN).rest.repos.createRelease({
    owner,
    repo,
    tag_name: tagName,
    body: changelog,
  })
}

run()
