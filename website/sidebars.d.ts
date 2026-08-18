export let docs: (string | {
    type: string;
    label: string;
    collapsed: boolean;
    link: {
        type: string;
        id: string;
        title?: undefined;
        slug?: undefined;
        keywords?: undefined;
        description?: undefined;
    };
    items: string[];
} | {
    type: string;
    label: string;
    link: {
        type: string;
        title: string;
        slug: string;
        keywords: string[];
        id?: undefined;
        description?: undefined;
    };
    items: string[];
    collapsed?: undefined;
} | {
    type: string;
    label: string;
    link: {
        type: string;
        title: string;
        description: string;
        slug: string;
        id?: undefined;
        keywords?: undefined;
    };
    items: ({
        type: string;
        id: string;
        label: string;
        items?: undefined;
    } | {
        type: string;
        label: string;
        items: string[];
        id?: undefined;
    })[];
    collapsed?: undefined;
} | {
    type: string;
    label: string;
    link: {
        type: string;
        title: string;
        slug: string;
        keywords: string[];
        id?: undefined;
        description?: undefined;
    };
    items: {
        type: string;
        dirName: string;
    }[];
    collapsed?: undefined;
})[];
