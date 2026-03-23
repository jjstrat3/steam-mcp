# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it
responsibly by emailing the maintainer directly rather than opening a public
issue.

**Contact:** Open a [private security advisory](https://github.com/jjstrat3/steam-mcp/security/advisories/new) on this repository.

You can expect an initial response within 72 hours. Once the issue is confirmed,
a fix will be developed and released as soon as possible.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Scope

This project is an MCP server that proxies requests to the Steam Web API. It
does not store user credentials, but it does handle API keys at runtime via
environment variables. Security concerns related to API key exposure, input
validation, or dependency vulnerabilities are in scope.
