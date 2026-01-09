import type { Page } from 'playwright';

import { StagehandController } from '../../packages/stagehand-crawler/src/internals/stagehand-controller';
import type { StagehandPlugin } from '../../packages/stagehand-crawler/src/internals/stagehand-plugin';

describe('StagehandController', () => {
    let mockPlugin: StagehandPlugin;
    let mockStagehand: any;
    let mockBrowser: any;
    let stagehandInstances: WeakMap<any, any>;

    beforeEach(() => {
        // Create mock browser
        mockBrowser = {
            newContext: vi.fn().mockResolvedValue({
                newPage: vi.fn().mockResolvedValue({
                    goto: vi.fn(),
                    close: vi.fn(),
                    context: vi.fn().mockReturnValue({
                        cookies: vi.fn().mockResolvedValue([]),
                        addCookies: vi.fn().mockResolvedValue(undefined),
                    }),
                }),
                close: vi.fn(),
            }),
            close: vi.fn(),
            contexts: vi.fn().mockReturnValue([]),
            isConnected: vi.fn().mockReturnValue(true),
        };

        // Create mock Stagehand
        mockStagehand = {
            close: vi.fn().mockResolvedValue(undefined),
            context: {
                newPage: vi.fn().mockResolvedValue({
                    goto: vi.fn(),
                    close: vi.fn(),
                    context: vi.fn().mockReturnValue({
                        cookies: vi.fn().mockResolvedValue([]),
                        addCookies: vi.fn().mockResolvedValue(undefined),
                    }),
                }),
            },
        };

        // Create WeakMap to store Stagehand instances
        stagehandInstances = new WeakMap();
        stagehandInstances.set(mockBrowser, mockStagehand);

        // Create mock plugin
        mockPlugin = {
            name: 'StagehandPlugin',
        } as any;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should create controller', () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        expect(controller).toBeDefined();
    });

    test('should get Stagehand instance', () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        const stagehand = controller.getStagehand();

        expect(stagehand).toBe(mockStagehand);
    });

    test('should throw error if Stagehand instance not found', () => {
        const controller = new StagehandController(mockPlugin, new WeakMap());
        (controller as any).browser = mockBrowser;

        expect(() => controller.getStagehand()).toThrow('Stagehand instance not found for browser');
    });

    test('should set cookies', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        const mockPage: any = {
            context: vi.fn().mockReturnValue({
                addCookies: vi.fn().mockResolvedValue(undefined),
            }),
        };

        const cookies = [
            {
                name: 'test_cookie',
                value: 'test_value',
                domain: 'example.com',
                path: '/',
                expires: 1234567890,
                httpOnly: true,
                secure: true,
                sameSite: 'Lax' as const,
            },
        ];

        await (controller as any)._setCookies(mockPage, cookies);

        expect(mockPage.context().addCookies).toHaveBeenCalledWith([
            {
                name: 'test_cookie',
                value: 'test_value',
                domain: 'example.com',
                path: '/',
                expires: 1234567890,
                httpOnly: true,
                secure: true,
                sameSite: 'Lax',
            },
        ]);
    });

    test('should get cookies', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        const mockPage: any = {
            context: vi.fn().mockReturnValue({
                cookies: vi.fn().mockResolvedValue([
                    {
                        name: 'test_cookie',
                        value: 'test_value',
                        domain: 'example.com',
                        path: '/',
                        expires: 1234567890,
                        httpOnly: true,
                        secure: true,
                        sameSite: 'Lax' as const,
                    },
                ]),
            }),
        };

        const cookies = await (controller as any)._getCookies(mockPage);

        expect(cookies).toEqual([
            {
                name: 'test_cookie',
                value: 'test_value',
                domain: 'example.com',
                path: '/',
                expires: 1234567890,
                httpOnly: true,
                secure: true,
                sameSite: 'Lax',
            },
        ]);
    });

    test('should handle cookies without expiration', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        const mockPage: any = {
            context: vi.fn().mockReturnValue({
                cookies: vi.fn().mockResolvedValue([
                    {
                        name: 'session_cookie',
                        value: 'session_value',
                        domain: 'example.com',
                        path: '/',
                        expires: -1,
                        httpOnly: false,
                        secure: false,
                        sameSite: 'None' as const,
                    },
                ]),
            }),
        };

        const cookies = await (controller as any)._getCookies(mockPage);

        expect(cookies[0].expires).toBeUndefined();
    });

    test('should close Stagehand on controller close', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        await (controller as any)._close();

        expect(mockStagehand.close).toHaveBeenCalled();
    });

    test('should handle close errors gracefully', async () => {
        mockStagehand.close = vi.fn().mockRejectedValue(new Error('Close failed'));

        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        // Should not throw
        await expect((controller as any)._close()).resolves.toBeUndefined();
    });

    test('should kill Stagehand on controller kill', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        await (controller as any)._kill();

        expect(mockStagehand.close).toHaveBeenCalledWith({ force: true });
    });

    test('should handle kill errors gracefully', async () => {
        mockStagehand.close = vi.fn().mockRejectedValue(new Error('Kill failed'));

        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        // Should not throw
        await expect((controller as any)._kill()).resolves.toBeUndefined();
    });
});
