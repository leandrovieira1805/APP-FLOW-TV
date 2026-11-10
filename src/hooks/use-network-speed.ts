import { useState, useEffect } from "react";

export interface NetworkSpeedInfo {
  isSlow: boolean;
  effectiveType: string;
  downlink?: number;
  rtt?: number;
}

export function useNetworkSpeed(): NetworkSpeedInfo {
  const [speed, setSpeed] = useState<NetworkSpeedInfo>({
    isSlow: false,
    effectiveType: "4g",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

    const updateSpeed = () => {
      if (!conn) return;
      const isSlow =
        conn.effectiveType === "slow-2g" ||
        conn.effectiveType === "2g" ||
        conn.effectiveType === "3g" ||
        (conn.downlink && conn.downlink < 3.5) ||
        (conn.rtt && conn.rtt > 250) ||
        conn.saveData === true;

      setSpeed({
        isSlow,
        effectiveType: conn.effectiveType || "4g",
        downlink: conn.downlink,
        rtt: conn.rtt,
      });
    };

    updateSpeed();
    if (conn) {
      conn.addEventListener("change", updateSpeed);
      return () => conn.removeEventListener("change", updateSpeed);
    }
  }, []);

  return speed;
}
