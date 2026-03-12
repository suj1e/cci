## 1. Project Setup

- [x] 1.1 Initialize monorepo structure, create packages/bridge directory
- [x] 1.2 Initialize pnpm project for bridge service, add TypeScript configuration
- [x] 1.3 Add dependencies: @larksuiteoapi/node-sdk, ws, js-yaml, commander, etc.
- [x] 1.4 Configure package.json as global installable CLI tool

## 2. Bridge Service Core Implementation

- [x] 2.1 Implement configuration file reader, support ~/.feishu-bridge/config.yaml
- [x] 2.2 Implement Feishu WebSocket client using official SDK, handle message receive
- [x] 2.3 Implement local WebSocket server for CLI connection
- [x] 2.4 Implement single session control: reject new connections when session exists
- [x] 2.5 Implement message routing: forward Feishu messages to CLI, CLI responses to Feishu
- [x] 2.6 Implement automatic reconnection for Feishu WebSocket

## 3. CLI Commands Implementation

- [x] 3.1 Implement `feishu-bridge start` command: start bridge service
- [x] 3.2 Implement `feishu-bridge status` command: check running status
- [x] 3.3 Implement `feishu-bridge stop` command: stop running service
- [x] 3.4 Implement `feishu-bridge config` command: generate default configuration file

## 4. Message Protocol Implementation

- [x] 4.1 Implement message format conversion: CLI markdown to Feishu rich text
- [x] 4.2 Implement code block format conversion: support syntax highlighting in Feishu
- [x] 4.3 Implement streaming response support: fragment sending and merging

## 5. Claude CLI Skills Implementation

- [ ] 5.1 Create cci:connect-feishu skill: detect bridge service, establish connection
- [ ] 5.2 Create cci:disconnect-feishu skill: close connection, stop message forwarding
- [ ] 5.3 Implement message interception: forward all CLI output to bridge service
- [ ] 5.4 Implement message injection: forward bridge messages to CLI as user input

## 6. Testing and Documentation

- [ ] 6.1 Test end-to-end flow: Feishu → Bridge → CLI → Bridge → Feishu
- [ ] 6.2 Test streaming response real-time display
- [ ] 6.3 Test command execution: CLI commands work correctly from Feishu
- [x] 6.4 Add README documentation: installation, configuration, usage guide
