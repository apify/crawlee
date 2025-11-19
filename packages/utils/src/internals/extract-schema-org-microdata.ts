/**
 * Extracts Schema.org microdata from a document and returns it as an array of objects.
 * Recursively processes itemscope, itemtype, and itemprop attributes.
 */
export function extractSchemaOrgMicrodata(): Record<string, any>[] {
    const getItemProps = function (element: Element) {
        let itemprops = Array.from(element.querySelectorAll('[itemprop]')).filter((itemprop) => {
            let parent = itemprop.parentElement;
            while (parent && parent != element) {
                if (parent.hasAttribute('itemscope')) return false;
                parent = parent.parentElement;
            }
            return true;
        });
        return itemprops;
    };

    const extractValue = (elem: Element): string | null => {
        if ((elem as HTMLElement).getAttribute('content')) {
            return (elem as HTMLElement).getAttribute('content');
        } else if ((elem as HTMLImageElement).getAttribute('src')) {
            return (elem as HTMLImageElement).getAttribute('src');
        } else if ((elem as HTMLAnchorElement).getAttribute('href')) {
            return (elem as HTMLAnchorElement).getAttribute('href');
        } else if ((elem as HTMLElement).textContent) {
            return (elem as HTMLElement).textContent!.trim();
        } else {
            return null;
        }
    };

    const addProperty = function (item: Record<string, any>, propName: any, value: any) {
        if (typeof value === 'string') value = value.trim();
        if (Array.isArray(item[propName])) item[propName].push(value);
        else if (typeof item[propName] !== 'undefined') item[propName] = [item[propName], value];
        else item[propName] = value;
    };

    const extractItemProps = function (ele: Element) {
        let rawType = ele.getAttribute('itemtype') || '';
        let itemScope: Record<string, any> = { _type: rawType.trim() };
        let count = 0;

        let itemProps = getItemProps(ele);

        itemProps.forEach((itemProp) => {
            const propName = itemProp.getAttribute('itemprop');
            if (!propName) return;
            addProperty(
                itemScope,
                itemProp.getAttribute('itemprop'),
                itemProp.hasAttribute('itemscope') ? extractItemProps(itemProp) : extractValue(itemProp),
            );
            count++;
        });

        if (count === 0) addProperty(itemScope, '_value', extractValue(ele));

        return itemScope;
    };

    const extractItemScopeEles = function () {
        let elements = Array.from(document.querySelectorAll('[itemscope]')).filter((ele) => {
            let parent = ele.parentElement;
            while (parent && parent != document.body) {
                if (parent.hasAttribute('itemscope')) return false;
                parent = parent.parentElement;
            }
            return true;
        });

        let extractedData: Record<string, any>[] = [];
        elements.forEach((ele) => {
            extractedData.push(extractItemProps(ele));
        });
        return extractedData;
    };
    return extractItemScopeEles();
}
