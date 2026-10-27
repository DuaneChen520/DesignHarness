#!/usr/bin/env node
/**
 * `designharness-mcp` — the stdio entry point an MCP client spawns.
 *
 * stderr is the only diagnostic channel (stdout is the protocol), and the process exits
 * cleanly when the client closes the transport so hosts never see a hung server.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`${SERVER_NAME}@${SERVER_VERSION} listening on stdio\n`);

  const shutdown = (): void => {
    void server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  transport.onclose = () => {
    process.stderr.write(`${SERVER_NAME}: transport closed\n`);
  };
}

main().catch((error: unknown) => {
  process.stderr.write(`${SERVER_NAME} failed to start: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
