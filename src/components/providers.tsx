"use client";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
const LocaleContext = createContext({ ur: false, toggle: () => {} });
export const useLocale = () => {
  const locale = useContext(LocaleContext);
  return { ...locale, t: dictionaries[locale.ur ? "ur" : "en"] };
};
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            refetchIntervalInBackground: false,
            retryDelay: (n) => Math.min(1000 * 2 ** n, 10000),
          },
        },
      }),
  );
  const [ur, setUr] = useState(false);
  return (
    <QueryClientProvider client={client}>
      <LocaleContext.Provider value={{ ur, toggle: () => setUr((v) => !v) }}>
        {children}
      </LocaleContext.Provider>
    </QueryClientProvider>
  );
}
