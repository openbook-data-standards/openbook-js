import { createContext } from "react";
import type { OpenBookClient } from "@openbook/core";

/** The connection the provider owns. `null` when no feed is configured. */
export const OpenBookContext = createContext<OpenBookClient | null>(null);
