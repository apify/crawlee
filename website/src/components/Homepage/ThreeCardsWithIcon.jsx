import Link from '@docusaurus/Link';
import clsx from 'clsx';
import React from 'react';

import styles from './ThreeCardsWithIcon.module.css';

export default function ThreeCardsWithIcon({ cards }) {
    return (
        <div className={styles.cardsWrapper}>
            {cards?.map((card, index) => {
                const content = (
                    <>
                        <div className={styles.cardIcon}>{card.icon}</div>
                        <h3 className={styles.cardTitle}>{card.title}</h3>
                        <p className={styles.cardDescription}>
                            {card.description}
                        </p>
                        {card.actionLink && (
                            <Link
                                to={card.actionLink.href}
                                className={styles.cardAction}
                            >
                                {card.actionLink.text}
                            </Link>
                        )}
                    </>
                );

                if (card.to) {
                    return (
                        <Link
                            className={clsx(
                                styles.cardItem,
                                styles.cardItemLink,
                            )}
                            to={card.to}
                            key={index}
                        >
                            {content}
                        </Link>
                    );
                }

                return (
                    <div className={styles.cardItem} key={index}>
                        {content}
                    </div>
                );
            })}
        </div>
    );
}
