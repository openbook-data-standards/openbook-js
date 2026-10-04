import { useContext, useMemo, useSyncExternalStore } from "react";
import type { AppliedRecord, OpenBookClient, OpenBookDoc, OpenBookStatus } from "@openbook/core";
import { OpenBookContext } from "./context.js";

const noopSubscribe = (): (() => void) => () => undefined;
const zero = (): number => 0;
const off = (): OpenBookStatus => "off";

/** The connection the provider owns, or `null`. */
export function useOpenBookClient(): OpenBookClient | null {
  return useContext(OpenBookContext);
}

/** A number that changes whenever any document changes. */
export function useOpenBookVersion(): number {
  const client = useContext(OpenBookContext);
  return useSyncExternalStore(
    client ? client.store.subscribe : noopSubscribe,
    client ? client.store.getVersion : zero,
    client ? client.store.getVersion : zero,
  );
}

/** One document, e.g. `useOpenBookDoc("fixture", id)`. */
export function useOpenBookDoc(object: string, id = ""): OpenBookDoc | undefined {
  const client = useContext(OpenBookContext);
  useOpenBookVersion();
  return client?.get(object, id);
}

/** Every document of one type, e.g. `useOpenBookDocs("market")`. */
export function useOpenBookDocs(object: string): OpenBookDoc[] {
  const client = useContext(OpenBookContext);
  const version = useOpenBookVersion();
  return useMemo(() => (client ? client.all(object) : []), [client, object, version]);
}

/** One document with the envelope that produced it, for extension fields. */
export function useOpenBookRecord(object: string, id = ""): AppliedRecord | undefined {
  const client = useContext(OpenBookContext);
  useOpenBookVersion();
  return client?.store.getRecord(object, id);
}

/** Every document of one type, each with the envelope that produced it. */
export function useOpenBookRecords(object: string): AppliedRecord[] {
  const client = useContext(OpenBookContext);
  const version = useOpenBookVersion();
  return useMemo(() => (client ? client.store.records(object) : []), [client, object, version]);
}

/** The connection status, for a source badge. */
export function useOpenBookStatus(): OpenBookStatus {
  const client = useContext(OpenBookContext);
  return useSyncExternalStore(
    client ? client.subscribeStatus : noopSubscribe,
    client ? () => client.status : off,
    client ? () => client.status : off,
  );
}

/** The highest sequence applied, for a resume/debug badge. */
export function useOpenBookLastSequence(): number {
  const client = useContext(OpenBookContext);
  useOpenBookVersion();
  return client?.lastSequence ?? 0;
}
