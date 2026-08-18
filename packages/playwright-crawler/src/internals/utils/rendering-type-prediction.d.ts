import type { RecoverableStatePersistenceOptions, Request } from '@crawlee/core';
export type RenderingType = 'clientOnly' | 'static';
export interface RenderingTypePredictorOptions {
    /** A number between 0 and 1 that determines the desired ratio of rendering type detections */
    detectionRatio: number;
    persistenceOptions?: Partial<RecoverableStatePersistenceOptions>;
}
/**
 * Minimal contract that any object passed to {@apilink AdaptivePlaywrightCrawler} as its
 * `renderingTypePredictor` option must satisfy.
 *
 * @experimental
 */
export interface IRenderingTypePredictor {
    /** Predict the rendering type for a request, and how likely the crawler should be to verify it. */
    predict(request: Request): {
        renderingType: RenderingType;
        detectionProbabilityRecommendation: number;
    };
    /** Report a detected rendering type, so that future predictions can take it into account. */
    storeResult(requests: Request | Request[], renderingType: RenderingType): void;
}
/**
 * Stores rendering type information for previously crawled URLs and predicts the rendering type for URLs that have yet to be crawled and recommends when rendering type detection should be performed.
 *
 * @experimental
 */
export declare class RenderingTypePredictor implements IRenderingTypePredictor {
    #private;
    constructor({ detectionRatio, persistenceOptions }: RenderingTypePredictorOptions);
    persistState(): Promise<void>;
    /**
     * Initialize the predictor by restoring persisted state.
     */
    initialize(): Promise<void>;
    /**
     * Stop persisting the model, writing it out one last time. `initialize()` reopens the persistence window.
     */
    teardown(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    /**
     * Predict the rendering type for a given URL and request label.
     */
    predict({ url, loadedUrl, label }: Request): {
        renderingType: RenderingType;
        detectionProbabilityRecommendation: number;
    };
    /**
     * Store the rendering type for a given URL and request label. This updates the underlying prediction model, which may be costly.
     */
    storeResult(requests: Request | Request[], renderingType: RenderingType): void;
    private resultCount;
    private calculateFeatureVector;
    private retrain;
}
