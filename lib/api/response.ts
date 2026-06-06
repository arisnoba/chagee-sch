import { NextResponse } from "next/server";

export function apiError(message: string, status = 400, code?: string) {
  return NextResponse.json(
    code ? { error: message, code } : { error: message },
    { status }
  );
}

export function apiInternalError(error: unknown, message = "요청 처리 중 오류가 발생했습니다.") {
  console.error(error);
  return apiError(message, 500);
}
