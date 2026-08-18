"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ThreeCardsWithIcon;
const tslib_1 = require("tslib");
const Link_1 = tslib_1.__importDefault(require("@docusaurus/Link"));
const clsx_1 = tslib_1.__importDefault(require("clsx"));
const react_1 = tslib_1.__importDefault(require("react"));
const ThreeCardsWithIcon_module_css_1 = tslib_1.__importDefault(require("./ThreeCardsWithIcon.module.css"));
function ThreeCardsWithIcon({ cards }) {
    return (<div className={ThreeCardsWithIcon_module_css_1.default.cardsWrapper}>
            {cards?.map((card, index) => {
            const content = (<>
                        <div className={ThreeCardsWithIcon_module_css_1.default.cardIcon}>{card.icon}</div>
                        <h3 className={ThreeCardsWithIcon_module_css_1.default.cardTitle}>{card.title}</h3>
                        <p className={ThreeCardsWithIcon_module_css_1.default.cardDescription}>
                            {card.description}
                        </p>
                        {card.actionLink && (<Link_1.default to={card.actionLink.href} className={ThreeCardsWithIcon_module_css_1.default.cardAction}>
                                {card.actionLink.text}
                            </Link_1.default>)}
                    </>);
            if (card.to) {
                return (<Link_1.default className={(0, clsx_1.default)(ThreeCardsWithIcon_module_css_1.default.cardItem, ThreeCardsWithIcon_module_css_1.default.cardItemLink)} to={card.to} key={index}>
                            {content}
                        </Link_1.default>);
            }
            return (<div className={ThreeCardsWithIcon_module_css_1.default.cardItem} key={index}>
                        {content}
                    </div>);
        })}
        </div>);
}
