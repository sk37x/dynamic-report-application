import { apiConfig } from '../../config/api.config';
import { ApiError } from './api-error';

type ApiRequestOptions = {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: HeadersInit;
    signal?: AbortSignal;
}

function readMessage(payload: unknown): string | undefined {
    if (typeof payload !== 'object' || payload === null || !("message" in payload)) {
        return undefined;
    }

    const message = payload.message;
    if (typeof message === 'string' && message.trim()) {
        return message;
    }

    if (Array.isArray(message)) {
        const messages = message.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0,
        )

        return message.length > 0
            ? messages.join("\n")
            : undefined;
    }

    return undefined;
}


/**
 * Browser-side JSON API client.
 *
 * - path ต้องเริ่มด้วย "/" เช่น "/auth/me"
 * - response ที่ไม่มี body ให้ใช้ T = void
 * - T เป็น TypeScript type ไม่ใช่ runtime validation
 */

export async function apiRequest<T>(
    path: string,
    options: ApiRequestOptions = {},
): Promise<T> {
    
    if(typeof window === 'undefined') {
        throw new Error(
            'apiRequest is browser-only. Use a separate server API client.'
        )
    }

    if(!path.startsWith('/') || path.startsWith('//')) {
        throw new Error('API path must start with a single "/".');
    }

    const {
        method = 'GET',
        body,
        headers = {},
        signal,
    } = options;

    const requestHeaders = new Headers(headers);
    requestHeaders.set('Accept', 'application/json');

    const serializedBody = body === undefined ? undefined : JSON.stringify(body);

    if(serializedBody !== undefined) {
        requestHeaders.set('Content-Type', 'application/json');
    }

    let response: Response;
    let text: string;

    try {
        response = await fetch(`${apiConfig.baseUrl}${path}`, {
            method,
            body: serializedBody,
            headers: requestHeaders,
            credentials: 'include',
            cache: 'no-store',
            signal,
        });

        text = await response.text();
    } catch (error) {

        if(signal?.aborted) {
            throw error;
        }

        throw new ApiError('ไม่สามารถติดต่อระบบได้ กรุณาลองใหม่อีกครั้ง', 0);
    }

    let payload: unknown = undefined;
    let validJson = true;

    if(text.trim()) {
        try { 
            payload = JSON.parse(text);
        } catch {
            validJson = false;
        }
    }

    if(!response.ok) {
        throw new ApiError(
            readMessage(payload) || `เรียกข้อมูลไม่สำเร็จ (HTTP ${response.status}) กรุณาลองใหม่อีกครั้ง`,
            response.status,
            payload,
        )
    }

    if(!validJson) {
        throw new ApiError(
            "รูปแบบข้อมูลตอบกลับไม่ถูกต้อง: ต้องเป็น JSON",
            response.status,
        )
    }

    return payload as T;
}