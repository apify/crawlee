import { KeyValueStore, MemoryStorageClient, Request, serviceLocator } from '@crawlee/core';
import { RenderingTypePredictor } from '@crawlee/playwright';
import { beforeEach, describe, expect, it } from 'vitest';

describe('RenderingTypePredictor', () => {
    beforeEach(async () => {
        serviceLocator.setStorageClient(new MemoryStorageClient());
    });

    describe('persistence', () => {
        it('should persist and restore state correctly', async () => {
            const persistStateKey = 'rendering-type-predictor-test';

            // Create a predictor and store some results
            const predictor = new RenderingTypePredictor({
                detectionRatio: 0.1,
                persistenceOptions: { persistStateKey },
            });
            await predictor.initialize();

            // Store some detection results
            const staticRequest = new Request({ url: 'https://example.com/static-page' });
            const clientRequest = new Request({ url: 'https://example.com/dynamic-app' });

            predictor.storeResult(staticRequest, 'static');
            predictor.storeResult(clientRequest, 'clientOnly');

            // Persist the state
            const store = await KeyValueStore.open();
            // eslint-disable-next-line dot-notation
            await predictor['state'].persistState(); // Access private state for persistence

            // RecoverableState persists with a `text/plain` content type on purpose (it owns
            // (de)serialization), so the frontend hands back the raw serialized string here.
            const serializedState = await store.getValue<string>(persistStateKey);
            expect(serializedState).not.toBeNull();
            const parsedState = JSON.parse(serializedState!);
            expect(parsedState).toHaveProperty('logreg');
            expect(parsedState).toHaveProperty('detectionResults');

            // Create a new predictor and verify it restores the state
            const restoredPredictor = new RenderingTypePredictor({
                detectionRatio: 0.1,
                persistenceOptions: { persistStateKey },
            });
            await restoredPredictor.initialize();

            // The restored predictor should predict 'static' for a similar URL
            const prediction = restoredPredictor.predict(new Request({ url: 'https://example.com/static-page' }));
            expect(prediction.renderingType).toBe('static');
        });

        it('should initialize with default state when no persisted state exists', async () => {
            const predictor = new RenderingTypePredictor({
                detectionRatio: 0.5,
                persistenceOptions: { persistStateKey: 'non-existent-key' },
            });

            await expect(predictor.initialize()).resolves.not.toThrow();

            // With no stored results, prediction should return clientOnly with high detection probability
            const prediction = predictor.predict(new Request({ url: 'https://example.com/test' }));
            expect(prediction.renderingType).toBe('clientOnly');
            expect(prediction.detectionProbabilityRecommendation).toBe(1);
        });
    });
});
