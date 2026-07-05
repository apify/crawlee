/**
 * Options for setting a crawler run's status message via {@apilink BasicCrawler.setStatusMessage}.
 *
 * Setting a status message is not a storage concern — the crawler broadcasts it through the event
 * system (`EventType.STATUS_MESSAGE`), and integrations such as the Apify SDK forward it to their
 * status-reporting backend.
 */
export interface SetStatusMessageOptions {
    /** Whether this is the final status message of the run. */
    isStatusMessageTerminal?: boolean;
    /** The log level to log the message with. Defaults to `'DEBUG'`. */
    level?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
}
