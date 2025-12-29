/**
 * MCP 메소드 핸들러
 * TASK-02-02에서 완성
 */

import {
  JsonRpcRequest,
  JsonRpcResponse,
  MCPSession,
} from '../types/mcp';
import { Errors } from '../utils/json-rpc';

export async function handleMCPMethod(
  request: JsonRpcRequest,
  _session: MCPSession
): Promise<JsonRpcResponse> {
  // 임시 구현 - TASK-02-02에서 완성
  return Errors.methodNotFound(request.id ?? null, request.method);
}
