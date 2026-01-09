import * as StagehandModule from '../../packages/stagehand-crawler/src';

describe('@crawlee/stagehand exports', () => {
    test('should export StagehandCrawler', () => {
        expect(StagehandModule.StagehandCrawler).toBeDefined();
    });

    test('should export createStagehandRouter', () => {
        expect(StagehandModule.createStagehandRouter).toBeDefined();
        expect(typeof StagehandModule.createStagehandRouter).toBe('function');
    });

    test('should export types', () => {
        // Type exports are checked at compile time, but we can verify the module structure
        expect(StagehandModule).toBeDefined();
    });

    test('should re-export from @crawlee/browser', () => {
        // Should include common Crawlee exports
        expect(StagehandModule.Router).toBeDefined();
        expect(StagehandModule.Dataset).toBeDefined();
        expect(StagehandModule.RequestQueue).toBeDefined();
    });
});
