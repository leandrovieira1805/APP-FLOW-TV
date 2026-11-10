import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAccount } from "./use-account";
import type { Account } from "../lib/xtream";

export function useRequireAccount(): { account: Account | null; ready: boolean } {
  const { account, ready } = useAccount();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !account) {
      navigate({ to: "/login", replace: true });
    }
  }, [ready, account, navigate]);

  return { account, ready };
}
