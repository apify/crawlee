import log from '@apify/log';

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

    test('should set cookies (stubbed - Stagehand v3 limitation)', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        const mockPage: any = {};

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

        // Should complete without error even though it doesn't actually set cookies
        // This is a known limitation - Stagehand v3 doesn't have cookie management APIs
        await expect((controller as any)._setCookies(mockPage, cookies)).resolves.toBeUndefined();
    });

    test('should get cookies (stubbed - Stagehand v3 limitation)', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        const mockPage: any = {};

        // Should return empty array since Stagehand v3 doesn't have cookie management APIs
        // This is a known limitation tracked in GitHub issue #1250
        const cookies = await (controller as any)._getCookies(mockPage);

        expect(cookies).toEqual([]);
    });

    test('should handle cookies without expiration (stubbed - Stagehand v3 limitation)', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        const mockPage: any = {};

        // Should return empty array since Stagehand v3 doesn't have cookie management APIs
        const cookies = await (controller as any)._getCookies(mockPage);

        expect(cookies).toEqual([]);
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

        // Mock log.error to prevent output and verify it's called
        const logErrorSpy = vi.spyOn(log, 'error').mockImplementation(() => {});

        // Should not throw
        await expect((controller as any)._close()).resolves.toBeUndefined();

        // Verify error was logged
        expect(logErrorSpy).toHaveBeenCalledWith('Error closing Stagehand', { error: expect.any(Error) });

        logErrorSpy.mockRestore();
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

    describe('Proxy Authentication', () => {
        let mockCdpSession: any;
        let mockContext: any;
        let mockPage: any;

        beforeEach(() => {
            mockCdpSession = {
                send: vi.fn().mockResolvedValue(undefined),
                on: vi.fn(),
            };

            mockPage = {
                goto: vi.fn(),
                close: vi.fn(),
                once: vi.fn(),
                context: vi.fn(),
            };

            mockContext = {
                newPage: vi.fn().mockResolvedValue(mockPage),
                newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
                cookies: vi.fn().mockResolvedValue([]),
                addCookies: vi.fn().mockResolvedValue(undefined),
            };

            mockPage.context = vi.fn().mockReturnValue(mockContext);

            mockBrowser.contexts = vi.fn().mockReturnValue([mockContext]);
        });

        test('should set up proxy authentication when credentials are provided', async () => {
            const pluginWithProxy = {
                ...mockPlugin,
                _proxyCredentials: {
                    username: 'testuser',
                    password: 'testpass',
                },
            } as any;

            const controller = new StagehandController(pluginWithProxy, stagehandInstances);
            (controller as any).browser = mockBrowser;

            await (controller as any)._newPage();

            // Verify CDP session was created
            expect(mockContext.newCDPSession).toHaveBeenCalledWith(mockPage);

            // Verify Fetch.enable was called with handleAuthRequests
            expect(mockCdpSession.send).toHaveBeenCalledWith('Fetch.enable', { handleAuthRequests: true });

            // Verify event handlers were set up
            expect(mockCdpSession.on).toHaveBeenCalledWith('Fetch.authRequired', expect.any(Function));
            expect(mockCdpSession.on).toHaveBeenCalledWith('Fetch.requestPaused', expect.any(Function));
        });

        test('should not set up proxy authentication when no credentials', async () => {
            const pluginWithoutProxy = {
                ...mockPlugin,
                _proxyCredentials: null,
            } as any;

            const controller = new StagehandController(pluginWithoutProxy, stagehandInstances);
            (controller as any).browser = mockBrowser;

            await (controller as any)._newPage();

            // Verify CDP session was NOT created for proxy auth
            expect(mockContext.newCDPSession).not.toHaveBeenCalled();
        });

        test('should provide credentials when auth is required', async () => {
            const pluginWithProxy = {
                ...mockPlugin,
                _proxyCredentials: {
                    username: 'proxyuser',
                    password: 'proxypass',
                },
            } as any;

            let authRequiredHandler: ((event: any) => Promise<void>) | null = null;

            mockCdpSession.on = vi.fn().mockImplementation((event, handler) => {
                if (event === 'Fetch.authRequired') {
                    authRequiredHandler = handler;
                }
            });

            const controller = new StagehandController(pluginWithProxy, stagehandInstances);
            (controller as any).browser = mockBrowser;

            await (controller as any)._newPage();

            // Simulate auth required event
            expect(authRequiredHandler).not.toBeNull();
            await authRequiredHandler!({ requestId: 'req123' });

            // Verify credentials were sent
            expect(mockCdpSession.send).toHaveBeenCalledWith('Fetch.continueWithAuth', {
                requestId: 'req123',
                authChallengeResponse: {
                    response: 'ProvideCredentials',
                    username: 'proxyuser',
                    password: 'proxypass',
                },
            });
        });

        test('should continue paused requests', async () => {
            const pluginWithProxy = {
                ...mockPlugin,
                _proxyCredentials: {
                    username: 'user',
                    password: 'pass',
                },
            } as any;

            let requestPausedHandler: ((event: any) => Promise<void>) | null = null;

            mockCdpSession.on = vi.fn().mockImplementation((event, handler) => {
                if (event === 'Fetch.requestPaused') {
                    requestPausedHandler = handler;
                }
            });

            const controller = new StagehandController(pluginWithProxy, stagehandInstances);
            (controller as any).browser = mockBrowser;

            await (controller as any)._newPage();

            // Simulate request paused event (no response yet - continue request)
            expect(requestPausedHandler).not.toBeNull();
            await requestPausedHandler!({ requestId: 'req456' });

            expect(mockCdpSession.send).toHaveBeenCalledWith('Fetch.continueRequest', {
                requestId: 'req456',
            });

            // Simulate request paused event (with response - continue response)
            await requestPausedHandler!({ requestId: 'req789', responseStatusCode: 200 });

            expect(mockCdpSession.send).toHaveBeenCalledWith('Fetch.continueResponse', {
                requestId: 'req789',
            });
        });

        test('should handle CDP session creation failure gracefully', async () => {
            const pluginWithProxy = {
                ...mockPlugin,
                _proxyCredentials: {
                    username: 'user',
                    password: 'pass',
                },
            } as any;

            mockContext.newCDPSession = vi.fn().mockRejectedValue(new Error('CDP session failed'));

            const controller = new StagehandController(pluginWithProxy, stagehandInstances);
            (controller as any).browser = mockBrowser;

            // Mock log.warning to prevent output and verify it's called
            const logWarningSpy = vi.spyOn(log, 'warning').mockImplementation(() => {});

            // Should not throw - just log warning
            await expect((controller as any)._newPage()).resolves.toBeDefined();

            // Verify warning was logged
            expect(logWarningSpy).toHaveBeenCalledWith('Failed to set up proxy authentication', {
                error: expect.any(Error),
            });

            logWarningSpy.mockRestore();
        });
    });
});
