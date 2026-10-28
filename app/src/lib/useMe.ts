import { useQuery } from "@tanstack/react-query";
import { api } from "../data/store";

/** The logged-in user (cached under ["me"] by RequireAuth) and whether they are an org admin. */
export function useMe() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.user.me, staleTime: 60_000 });
  return { me, isAdmin: me?.role === "admin" };
}
