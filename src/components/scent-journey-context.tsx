"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export const SCENT_MOOD_LABELS = {
  citrus: "خنک و مرکباتی",
  woody: "گرم و چوبی",
  floral: "ملایم و گلی",
} as const;

export type ScentMoodId = keyof typeof SCENT_MOOD_LABELS;

type ScentJourneyContextValue = {
  chosenMood: ScentMoodId | null;
  chooseMood: (mood: ScentMoodId) => void;
  clearMood: () => void;
};

const ScentJourneyContext = createContext<ScentJourneyContextValue | null>(null);

export function ScentJourneyProvider({ children }: { children: ReactNode }) {
  const [chosenMood, setChosenMood] = useState<ScentMoodId | null>(null);

  return (
    <ScentJourneyContext.Provider
      value={{
        chosenMood,
        chooseMood: setChosenMood,
        clearMood: () => setChosenMood(null),
      }}
    >
      {children}
    </ScentJourneyContext.Provider>
  );
}

export function useScentJourney() {
  const context = useContext(ScentJourneyContext);
  if (!context) {
    throw new Error("useScentJourney must be used within ScentJourneyProvider");
  }

  return context;
}
