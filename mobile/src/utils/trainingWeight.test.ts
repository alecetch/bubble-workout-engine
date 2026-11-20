import { inputToKg, kgToInput, formatWeight, formatVolume, suggestedLoad, unitLabel } from "./trainingWeight";
for (const pounds of [45,52.5,95,135,225,315]) test(`pound round trip ${pounds}`,()=>{
  const kg=inputToKg(String(pounds),"lbs"); expect(kgToInput(kg,"lbs")).toBe(String(pounds));
});
test("training conversion preserves two-decimal kg precision",()=>{expect(inputToKg("135","lbs")).toBe(61.23);expect(kgToInput(61.23,"lbs")).toBe("135");});
for(const input of ["", "  ", "abc", "12kg", "1.2.3", "Infinity", "-5"]) test(`invalid input ${input}`,()=>expect(inputToKg(input,"lbs")).toBeNull());
test("comma decimals, nulls and display precision",()=>{
 expect(inputToKg("52,5","lbs")).toBe(23.81);expect(kgToInput(null,"lbs")).toBe("");
 expect(formatWeight(61.23,"lbs")).toBe("135 lb");expect(formatWeight(null,"kg")).toBe("\u2013");
 expect(formatWeight(61.23,"kg",{decimals:1})).toBe("61.2 kg");expect(formatWeight(60,"kg",{decimals:1})).toBe("60.0 kg");
});
test("pound suggestions use plate steps and under-ten single pounds",()=>{
 expect(suggestedLoad(60,"lbs","total")).toEqual({value:130,text:"130 lb"});
 expect(suggestedLoad(22.5,"lbs","per_hand")).toEqual({value:50,text:"50 lb / hand"});
 expect(suggestedLoad(22.5,"lbs","per_side").text).toBe("50 lb / side");
 expect(suggestedLoad(3,"lbs","total")).toEqual({value:7,text:"7 lb"});
});
test("kg strings and volume separators stay unchanged",()=>{
 expect(formatWeight(60,"kg")).toBe("60 kg");expect(formatWeight(61.5,"kg")).toBe("61.5 kg");
 expect(suggestedLoad(22.5,"kg","per_hand").text).toBe("22.5 kg / hand");
 expect(formatVolume(5443.1,"lbs")).toBe("12,000 lb");expect(formatVolume(5443.1,"kg")).toBe("5,443 kg");
 expect(inputToKg("61.23","kg")).toBe(61.23);expect(kgToInput(61.23,"kg")).toBe("61.23");expect(unitLabel("lbs")).toBe("lb");
});
