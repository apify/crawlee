import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

export type RenderingType = 'static' | 'clientOnly';

const cleanHtml = ($: CheerioAPI): string | null => {
    $('script, style').remove();
    return $('body').html();
};

export const calculateChangeRatio = (htmlA$: CheerioAPI, htmlB$: CheerioAPI): number | null => {
    const cleanedHtmlA = cleanHtml(load(htmlA$.html()));
    const cleanedHtmlB = cleanHtml(load(htmlB$.html()));

    if (cleanedHtmlA === null || cleanedHtmlB === null) {
        return null;
    }

    return calculateRatio(cleanedHtmlB.length, cleanedHtmlA.length);
};

export const calculateRatio = (a: number, b: number) => Math.abs(b - a) / Math.max(a, 1);

export const detectRenderingTypeByChangeRatio = (clientSideMinChangeRatio: number, changeRatio: number | null): RenderingType => {
    if (changeRatio === null) {
        return 'clientOnly'; // Err on the side of caution
    }

    if (changeRatio >= clientSideMinChangeRatio) {
        return 'clientOnly';
    }

    return 'static';
};
