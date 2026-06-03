#!/usr/bin/env node
/**
 * KAgent capture hook — Claude Code PostToolUse(Edit) → .kagent/
 *
 * Adapts Claude Code's PostToolUse payload (Edit tool) to the shared
 * kagent-record.mjs. Works alongside the existing Cursor hook.
 *
 * Handles two payload shapes:
 *   1) PostToolUse(Edit): tool.input = { file_path, old_string, new_string }
 *   2) Cursor-style:      { file_path, edits: [{old_string, new_string}] }
 */
import path from "node:path";
import { recordFileChange, countFileLines } from "../../.cursor/hooks/kagent-record.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

/**
 * Extract file info from a tool-use payload.
 * Claude Code PostToolUse(Edit) sends:  tool = "Edit", input = { file_path, old_string, new_string }
 */
function extractEditInfo(payload) {
  // Claude Code PostToolUse(Edit) format
  if (payload.tool === "Edit" && payload.input?.file_path) {
    const input = payload.input;
    return {
      file_path: input.file_path,
      edits: [{ old_string: input.old_string ?? "", new_string: input.new_string ?? "" }],
      hook_event_name: payload.hook_event_name ?? "PostToolUse",
      conversation_id: payload.conversation_id,
      generation_id: payload.generation_id,
    };
  }
  // Cursor-style fallback (direct file_path + edits array)
  if (payload.file_path) {
    return {
      file_path: payload.file_path,
      edits: payload.edits ?? [],
      hook_event_name: payload.hook_event_name ?? "PostToolUse",
      conversation_id: payload.conversation_id,
      generation_id: payload.generation_id,
    };
  }
  return null;
}

readStdin()
  .then((payload) => {
    const info = extractEditInfo(payload);
    if (!info?.file_path) {
      process.exit(0);
      return;
    }

    const filePath = path.resolve(info.file_path);
    const workspaceRoot = process.cwd();
    const relativeFile = path.relative(workspaceRoot, filePath).split(path.sep).join("/");
    const linesAfter = countFileLines(filePath);

    recordFileChange({
      workspaceRoot,
      relativeFile,
      linesAfter,
      edits: info.edits,
      source: info.hook_event_name,
      actor: "agent",
      conversation_id: info.conversation_id ?? null,
      generation_id: info.generation_id ?? null,
      editor: "claude-code",
    });

    process.exit(0);
  })
  .catch((err) => {
    console.error("[kagent-capture-claude]", err.message);
    process.exit(0);
  });
