import LogisticRegression from 'ml-logistic-regression';
import { Matrix } from 'ml-matrix';
import stringComparison from 'string-comparison';

export type RenderingType = 'clientOnly' | 'static'

type URLComponents = string[];

const urlComponents = (url: URL): URLComponents => {
    return [url.hostname, ...url.pathname.split('/')];
};

const calculateUrlSimilarity = (a: URLComponents, b: URLComponents): number | undefined => {
    const values: number[] = [];

    if (a[0] !== b[0]) {
        return 0;
    }

    for (let i = 1; i < Math.max(a.length, b.length); i++) {
        values.push(stringComparison.jaroWinkler.similarity(a[i] ?? '', b[i] ?? '') > 0.8 ? 1 : 0);
    }

    return sum(values) / Math.max(a.length, b.length);
};

const sum = (values: number[]) => values.reduce((acc, value) => acc + value);
const mean = (values: number[]) => (values.length > 0 ? sum(values) / values.length : undefined);

type FeatureVector = [staticResultsSimilarity: number, clientOnlyResultsSimilarity: number];

export class RenderingTypePredictor {
    private renderingTypeDetectionResults = new Map<RenderingType, Map<string | undefined, URLComponents[]>>();
    private detectionRatio: number;
    private logreg: LogisticRegression;

    constructor({ detectionRatio }: { detectionRatio: number }) {
        this.detectionRatio = detectionRatio;
        this.logreg = new LogisticRegression({ numSteps: 1000, learningRate: 0.05 });
    }

    public predict(url: URL, label: string | undefined): { renderingType: RenderingType; detectionProbabilityRecommendation: number } {
        if (this.logreg.classifiers.length === 0) {
            return { renderingType: 'clientOnly', detectionProbabilityRecommendation: 1 };
        }

        const urlFeature = new Matrix([this.calculateFeatureVector(urlComponents(url), label)]);
        const [prediction] = this.logreg.predict(urlFeature);
        const scores = [this.logreg.classifiers[0].testScores(urlFeature), this.logreg.classifiers[1].testScores(urlFeature)];

        return {
            renderingType: prediction === 1 ? 'static' : 'clientOnly',
            detectionProbabilityRecommendation: Math.abs(scores[0] - scores[1]) < 0.1 ? 1 : this.detectionRatio * Math.max(1, 5 - this.resultCount(label)),
        };
    }

    public storeResult(url: URL, label: string | undefined, renderingType: RenderingType) {
        if (!this.renderingTypeDetectionResults.has(renderingType)) {
            this.renderingTypeDetectionResults.set(renderingType, new Map());
        }

        if (!this.renderingTypeDetectionResults.get(renderingType)!.has(label)) {
            this.renderingTypeDetectionResults.get(renderingType)!.set(label, []);
        }

        this.renderingTypeDetectionResults.get(renderingType)!.get(label)!.push(urlComponents(url));
        this.retrain();
    }

    private resultCount(label: string | undefined): number {
        return Array.from(this.renderingTypeDetectionResults.values())
            .map((results) => results.get(label)?.length ?? 0)
            .reduce((acc, value) => acc + value, 0);
    }

    protected calculateFeatureVector(url: URLComponents, label: string | undefined): FeatureVector {
        return [
            mean((this.renderingTypeDetectionResults.get('static')?.get(label) ?? []).map((otherUrl) => calculateUrlSimilarity(url, otherUrl) ?? 0)) ?? 0,
            mean((this.renderingTypeDetectionResults.get('clientOnly')?.get(label) ?? []).map((otherUrl) => calculateUrlSimilarity(url, otherUrl) ?? 0)) ?? 0,
        ];
    }

    protected retrain(): void {
        const X: FeatureVector[] = [
            [0, 1],
            [1, 0],
        ];
        const Y: number[] = [0, 1];

        for (const [renderingType, urlsByLabel] of this.renderingTypeDetectionResults.entries()) {
            for (const [label, urls] of urlsByLabel) {
                for (const url of urls) {
                    X.push(this.calculateFeatureVector(url, label));
                    Y.push(renderingType === 'static' ? 1 : 0);
                }
            }
        }

        this.logreg.train(new Matrix(X), Matrix.columnVector(Y));
    }
}
