import Link from '@docusaurus/Link';
import React from 'react';

import styles from './ThreeCardsWithIcon.module.css';

export default function ThreeCardsWithIcon({ cards }) {
    return (
        <div className={styles.cardsWrapper}>
            {cards?.map((card, index) => (
                <div className={styles.cardItem} key={index}>
                    <div className={styles.cardIcon}>{card.icon}</div>
                    <h3 className={styles.cardTitle}>{card.title}</h3>
                    <p className={styles.cardDescription}>{card.description}</p>
                    {card.actionLink && (
                        <Link
                            to={card.actionLink.href}
                            className={styles.cardAction}
                        >
                            {card.actionLink.text}
                        </Link>
                    )}
                </div>
            ))}
        </div>
    );
}
