declare module 'ml-logistic-regression' {
    import Matrix from 'ml-matrix';

    class LogisticRegressionTwoClasses {
        testScores(Xtest: Matrix): number;
    }

    export default class LogisticRegression {
        classifiers: LogisticRegressionTwoClasses[];

        constructor(
            options: Partial<{
                numSteps: number;
                learningRate: number;
            }>,
        );

        train(X: Matrix, Y: Matrix): void;

        predict(Xtest: Matrix): number[];
    }
}
