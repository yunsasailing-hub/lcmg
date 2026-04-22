import { createContext, useContext, useState, ReactNode } from 'react';

type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const NotificationPanelContext = createContext<Ctx>({
  open: false,
  setOpen: () => {},
});

export function NotificationPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <NotificationPanelContext.Provider value={{ open, setOpen }}>
      {children}
    </NotificationPanelContext.Provider>
  );
}

export function useNotificationPanel() {
  return useContext(NotificationPanelContext);
}
