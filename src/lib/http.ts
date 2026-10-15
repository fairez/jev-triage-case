import { NextResponse } from "next/server";
import { recover } from "./engine";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
export function init() { recover(); }
export function guard<T extends unknown[]>(fn: (...a: T) => Promise<Response> | Response) {
  return async (...a: T) => {
    try { init(); return await fn(...a); }
    catch (e) { console.error(e); return fail((e as Error).message || "Server error", 500); }
  };
}
