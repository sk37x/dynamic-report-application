import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./api-client";
import { ApiError } from "./api-error";

// ให้ test ใช้ URL แน่นอน ไม่ขึ้นกับ .env ของแต่ละเครื่อง
vi.mock("../../config/api.config", () => ({
    apiConfig: {
        baseUrl: "http://localhost:3001/api",
    },
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

describe("apiRequest", () => {
    it("ส่ง JSON พร้อม credentials และคืนข้อมูลจาก response", async () => {
        const user = {
            id: "1",
            username: "demo",
        };

        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify(user), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const result = await apiRequest<typeof user>("/auth/login", {
            method: "POST",
            body: {
                username: "demo",
                password: "test-password",
            },
        });

        expect(result).toEqual(user);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, options] = fetchMock.mock.calls[0];

        expect(url).toBe("http://localhost:3001/api/auth/login");

        expect(options).toMatchObject({
            method: "POST",
            credentials: "include",
            cache: "no-store",
            body: JSON.stringify({
                username: "demo",
                password: "test-password",
            }),
        });

        const headers = new Headers(options?.headers);

        expect(headers.get("Content-Type")).toBe("application/json");
        expect(headers.get("Accept")).toBe("application/json");
    });

    it("รองรับ HTTP 204 ที่ไม่มี response body", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(null, { status: 204 }),
        );

        await expect(
            apiRequest<void>("/auth/logout", { method: "POST" }),
        ).resolves.toBeUndefined();
    });

    it.each([401, 500])(
        "คง HTTP status %s และข้อความจาก backend",
        async (status) => {
            fetchMock.mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ message: "Request failed" }),
                    {
                        status,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );

            await expect(apiRequest("/auth/me")).rejects.toMatchObject({
                name: "ApiError",
                status,
                message: "Request failed",
            });
        },
    );

    it("แปลง network error เป็น ApiError status 0", async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

        await expect(apiRequest("/auth/me")).rejects.toMatchObject({
            name: "ApiError",
            status: 0,
        });
    });

    it("ปฏิเสธ response สำเร็จที่ไม่ใช่ JSON", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("<html>Unexpected page</html>", {
                status: 200,
                headers: { "Content-Type": "text/html" },
            }),
        );

        await expect(apiRequest("/auth/me")).rejects.toMatchObject({
            name: "ApiError",
            status: 200,
            message: "รูปแบบข้อมูลตอบกลับไม่ถูกต้อง: ต้องเป็น JSON",
        });
    });

    it("รักษา status ของ proxy error โดยไม่แสดง HTML เป็นข้อความ", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("<html>Bad gateway</html>", {
                status: 502,
                headers: { "Content-Type": "text/html" },
            }),
        );

        const error: unknown = await apiRequest("/auth/me").catch(
            (error: unknown) => error,
        );

        expect(error).toBeInstanceOf(ApiError);

        if (!(error instanceof ApiError)) {
            throw new Error("Expected apiRequest to reject with ApiError");
        }

        expect(error.status).toBe(502);
        expect(error.message).not.toContain("<html>");
    });

    it("ส่งต่อ AbortSignal และไม่แปลงการยกเลิกเป็น network error", async () => {
        const controller = new AbortController();
        const abortError = new DOMException("Aborted", "AbortError");

        controller.abort();
        fetchMock.mockRejectedValueOnce(abortError);

        await expect(
            apiRequest("/auth/me", { signal: controller.signal }),
        ).rejects.toBe(abortError);

        expect(fetchMock.mock.calls[0][1]?.signal).toBe(
            controller.signal,
        );
    });
});