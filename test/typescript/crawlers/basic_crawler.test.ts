import { BasicCrawler, BasicCrawlerOptions } from "../../..";

interface RequestData {
    myValue: string;
    myMaybeValue?: boolean;
}

interface SessionData {
    userAgent: string;
}

describe('BasicCrawler TS', () => {
    describe('generics', () => {
        test('options', () => {
            const requestQueue: any = {
                addRequest: () => {}
            };

            const options: BasicCrawlerOptions = {
                handleRequestFunction: null as any,
                requestQueue,
                sessionPoolOptions: {
                    sessionOptions: {
                        sessionPool: null as any,
                        userData: {
                            userAgent: 'user-agent'
                        }
                    }
                }
            };

            options.requestQueue!.addRequest({
                url: '',
                userData: {
                    myValue: 'asdf'
                }
            });

            options.requestQueue!.addRequest({
                url: '',
                userData: {
                    myValue: 'asdf',
                    myMaybeValue: false
                }
            }, { forefront: true });

            (options.sessionPoolOptions!.sessionOptions!.userData! as any).userAgent === 'user-agent';
        })
    });
});
