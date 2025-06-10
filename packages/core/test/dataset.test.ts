import { Dataset } from '../src/storages/dataset';

describe('Dataset exportToCSV', () => {
    it('should support function as title in exportToCSV', async () => {
        const dataset = await Dataset.open('function-title-test');
        await dataset.pushData({ message: 'Hello world!' });

        const dynamicTitle = () => `title-${Date.now()}`;

        // Should not throw
        await dataset.exportToCSV('fallback-key', {
            title: dynamicTitle,
        });
    });
});