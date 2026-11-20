import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getPreferredUnit } from "../profileApi";
import { useWeightUnit } from "./useWeightUnit";
vi.unmock("@tanstack/react-query");
vi.unmock("./useWeightUnit");
vi.mock("../profileApi",()=>({getPreferredUnit:vi.fn()}));
function setup() {
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 const wrapper=({children}:{children:React.ReactNode})=>React.createElement(QueryClientProvider,{client},children);
 return {client,...renderHook(()=>useWeightUnit(),{wrapper})};
}
test("defaults to kg while loading and on error",async()=>{
 let reject!:(error:Error)=>void;
 vi.mocked(getPreferredUnit).mockImplementation(()=>new Promise((_,r)=>{reject=r;}));
 const result=setup();expect(result.result.current).toBe("kg");
 await act(async()=>reject(new Error("offline")));
 await waitFor(()=>expect(result.client.getQueryState(["preferredUnit"])?.status).toBe("error"));
 expect(result.result.current).toBe("kg");result.unmount();result.client.clear();
});
test("returns lbs and reacts immediately to cached preference updates",async()=>{
 vi.mocked(getPreferredUnit).mockResolvedValue("lbs");const result=setup();
 await waitFor(()=>expect(result.result.current).toBe("lbs"));
 act(()=>result.client.setQueryData(["preferredUnit"],"kg"));
 await waitFor(()=>expect(result.result.current).toBe("kg"));result.unmount();result.client.clear();
});
