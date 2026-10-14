import { CREATURES } from "./pokemon-data.js";



// 1. ZAPIS DANYCH
// LocalStorage przechowuje kolekcję w tej przeglądarce.
const STORAGE_KEY="kaucjaPoksy.collection.v1";
class LocalCollectionStore{
 async load(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||{version:1,xp:0,scans:0,entries:{}}}catch{return {version:1,xp:0,scans:0,entries:{}}}}
 async save(data){localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
}
const store=new LocalCollectionStore();let state;let stream=null;let scanTimer=null;let detector=null;let scanning=false;let zxingControls=null;let scanAttempts=0;let lastScanDebug=0;let scanSucceeded=false;let scanGeneration=0;
// 2. FUNKCJE POMOCNICZE
// Skrót $ wyszukuje element HTML po jego id.
const $=id=>document.getElementById(id);
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function chooseCreature(ean){return CREATURES[hash(ean)%CREATURES.length]}
function validEAN(value){return /^(?:\d{8}|\d{12,14})$/.test(value)}
// 3. RENDEROWANIE INTERFEJSU
// render() wyświetla aktualny stan kolekcji i liczników.
function render(){
  const entries=state.entries;
  const found=new Set(Object.values(entries).map(x=>x.creatureId));
  $("count").textContent=found.size;$("xp").textContent=state.xp;$("scans").textContent=state.scans;
  $("progressText").textContent=found.size+" / "+CREATURES.length+" odkrytych";
  const query=(($("search")&&$("search").value)||"").trim().toLocaleLowerCase("pl");
  const filter=$("collectionFilter")?$("collectionFilter").value:"all";
  const visible=CREATURES.filter(c=>{
    const unlocked=found.has(c.id);
    const matches=(c.name+" "+c.dex+" "+String(c.dex).padStart(3,"0")).toLocaleLowerCase("pl").includes(query);
    return matches&&(filter==="all"||(filter==="found"&&unlocked)||(filter==="missing"&&!unlocked));
  });
  $("resultCount").textContent=visible.length+" Pokémonów";
  $("collection").innerHTML=visible.map(c=>{
   const entry=Object.values(entries).filter(e=>e.creatureId===c.id).sort((a,b)=>b.xp-a.xp)[0];
   const unlocked=!!entry,level=entry?1+Math.floor(entry.xp/5):0;
   const desc=unlocked?(c.desc&&!c.desc.startsWith("Otwórz szczegóły Pokédexu")&&!c.desc.includes("\\n")?c.desc:"Pobieram polski opis…"):'Jeszcze nieodkryty — kliknij, aby poznać wpis Pokédexu.';
   const cleanDesc=desc.replaceAll("\\n"," ").replaceAll("\\f"," ").replace(/[\n\f\r\t]/g," ").replace(/\s+/g," ").trim();
   return '<article class="creature '+(unlocked?'':'locked')+'" data-pokemon="'+c.dex+'" tabindex="0" role="button" aria-label="Szczegóły: '+c.name+'"><div class="art"><img src="'+c.image+'" alt="'+c.name+'" loading="lazy" onerror="this.style.opacity=.15"></div><div class="dex-number">NATIONAL DEX #'+String(c.dex).padStart(3,'0')+'</div><h3>'+c.name+'</h3><p data-description="'+c.dex+'">'+cleanDesc+'</p><div class="meta"><span data-type="'+c.dex+'">'+(unlocked?c.type:'Nieodkryty')+'</span><span>'+(unlocked?'Poziom '+level:'Zablokowany')+'</span></div><div class="progress"><span style="width:'+(unlocked?Math.min(100,20+level*10):0)+'%"></span></div><a class="wiki-link" href="'+c.wiki+'" target="_blank" rel="noopener noreferrer">Wiki Pokémon ↗</a></article>';
  }).join('');
  visible.filter(c=>found.has(c.id)).forEach(c=>loadListDescription(c));
}
function message(text){$("status").textContent=text}
function showPokemonPopup(creature,isDuplicate){
  $("pokemonModalHeading").textContent=isDuplicate?"Ponowne spotkanie!":"Pokémon odkryty!";
  const img=$("pokemonModalImage");img.src=creature.image;img.alt="Grafika: "+creature.name;img.onerror=()=>{img.style.display="none"};img.style.display="block";
  $("pokemonModalName").textContent=creature.name+" · #"+String(creature.dex).padStart(3,"0");
  $("pokemonModalType").textContent="Typ: "+creature.type;
  $("pokemonModalDesc").textContent=creature.desc;
  $("pokemonModalXp").textContent=isDuplicate?"+1 XP — kolejny egzemplarz":"+5 XP — nowy wpis w kolekcji";
  const modal=$("pokemonModal");modal.classList.add("open");$("pokemonModalClose").focus();
}
// 4. DANE Z POKÉAPI
// Ten zbiór zapobiega równoległemu pobieraniu tego samego wpisu.
const listDescriptionLoads=new Set();
async function loadListDescription(creature){
  if(listDescriptionLoads.has(creature.dex))return;
  if(creature.desc&&!creature.desc.startsWith("Otwórz szczegóły Pokédexu")&&!creature.desc.includes("\\n"))return;
  listDescriptionLoads.add(creature.dex);
  const update=()=>{
    const descNode=document.querySelector('[data-description="'+creature.dex+'"]');
    const typeNode=document.querySelector('[data-type="'+creature.dex+'"]');
    if(descNode)descNode.textContent=creature.desc||"Nie udało się pobrać opisu.";
    if(typeNode)typeNode.textContent=creature.type||"Typ nieznany";
  };
  try{
    const response=await fetch("https://pokeapi.co/api/v2/pokemon-species/"+creature.dex);
    if(!response.ok)throw new Error("Species unavailable");
    const species=await response.json();
    const normalize=text=>text.replaceAll("\\n"," ").replaceAll("\\f"," ").replace(/[\n\f\r\t]/g," ").replace(/\s+/g," ").trim();
    const polish=species.flavor_text_entries.find(x=>x.language.name==="pl");
    const english=species.flavor_text_entries.find(x=>x.language.name==="en")||species.flavor_text_entries[0];
    let desc=polish?normalize(polish.flavor_text):"";
    if(!desc&&english){
      const englishText=normalize(english.flavor_text);
      try{desc=await translateDescriptionToPolish(englishText)}
      catch(translationError){
        // Nie blokuj wpisu, jeśli zewnętrzny translator chwilowo nie działa.
        desc=englishText;
      }
    }
    if(desc)creature.desc=desc;
    const typeResponse=await fetch("https://pokeapi.co/api/v2/pokemon/"+creature.dex);
    if(typeResponse.ok){
      const pokemon=await typeResponse.json();
      const names={normal:"Normalny",fire:"Ogień",water:"Woda",electric:"Elektryczny",grass:"Trawa",ice:"Lód",fighting:"Walka",poison:"Trujący",ground:"Ziemia",flying:"Latający",psychic:"Psychiczny",bug:"Robak",rock:"Skała",ghost:"Duch",dragon:"Smok",dark:"Mroczny",steel:"Stal",fairy:"Wróżka"};
      creature.type=pokemon.types.map(t=>names[t.type.name]||t.type.name).join(" / ");
    }
    update();
  }catch(error){
    const descNode=document.querySelector('[data-description="'+creature.dex+'"]');
    if(descNode){
      descNode.textContent=creature.desc&&!creature.desc.startsWith("Otwórz szczegóły Pokédexu")?creature.desc:"Opis chwilowo niedostępny — kliknij kafelek, aby spróbować ponownie.";
    }
    console.warn("Nie udało się pobrać danych Pokédexu dla #"+creature.dex,error);
  }finally{listDescriptionLoads.delete(creature.dex)}
}
async function translateDescriptionToPolish(text){
  // Google Translate public web endpoint; no API key required.
  const url="https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pl&dt=t&q="+encodeURIComponent(text);
  const response=await fetch(url);
  if(!response.ok)throw new Error("Translation service unavailable");
  const data=await response.json();
  const translated=Array.isArray(data[0])?data[0].map(part=>part[0]||"").join(""):"";
  if(!translated.trim())throw new Error("Empty translation");
  return translated.replace(/\s+/g," ").trim();
}
async function showPokedexDetails(creature){
  $("pokemonModalHeading").textContent="Wpis Pokédexu";
  const img=$("pokemonModalImage");img.src=creature.image;img.alt="Grafika: "+creature.name;img.onerror=()=>{img.style.display="none"};img.style.display="block";
  $("pokemonModalName").textContent=creature.name+" · #"+String(creature.dex).padStart(3,"0");
  $("pokemonModalType").textContent="Pobieram typ Pokémonu…";
  $("pokemonModalDesc").textContent="Pobieram opis z PokéAPI. Link do wiki znajduje się poniżej.";
  $("pokemonModalXp").textContent="Źródło danych: PokéAPI · szczegóły: Bulbapedia";
  const modal=$("pokemonModal");modal.classList.add("open");
  try{
    const [pokemonResponse,speciesResponse]=await Promise.all([
      fetch("https://pokeapi.co/api/v2/pokemon/"+creature.dex),
      fetch("https://pokeapi.co/api/v2/pokemon-species/"+creature.dex)
    ]);
    if(!pokemonResponse.ok||!speciesResponse.ok)throw new Error("API unavailable");
    const pokemon=await pokemonResponse.json(),species=await speciesResponse.json();
    const typeNames={normal:"Normalny",fire:"Ogień",water:"Woda",electric:"Elektryczny",grass:"Trawa",ice:"Lód",fighting:"Walka",poison:"Trujący",ground:"Ziemia",flying:"Latający",psychic:"Psychiczny",bug:"Robak",rock:"Skała",ghost:"Duch",dragon:"Smok",dark:"Mroczny",steel:"Stal",fairy:"Wróżka"};
    creature.type=pokemon.types.map(t=>typeNames[t.type.name]||t.type.name).join(" / ");
    // Preferuj opis polski z PokéAPI. Gdy go brak, przetłumacz angielski opis automatycznie.
    const normalizeText=text=>text.replaceAll("\\n"," ").replaceAll("\\f"," ").replace(/[\n\f\r\t]/g," ").replace(/\s+/g," ").trim();
    const flavor=species.flavor_text_entries.find(x=>x.language.name==="pl");
    const polishFlavor=flavor?normalizeText(flavor.flavor_text):"";
    const hasPolishDescription=creature.desc && !creature.desc.startsWith("Otwórz szczegóły Pokédexu");
    let displayedDescription=polishFlavor || (hasPolishDescription?creature.desc:"");
    if(!displayedDescription){
      const englishFlavor=species.flavor_text_entries.find(x=>x.language.name==="en")||species.flavor_text_entries[0];
      const sourceText=englishFlavor?normalizeText(englishFlavor.flavor_text):"";
      if(sourceText){
        $("pokemonModalDesc").textContent="Tłumaczę opis na polski…";
        displayedDescription=await translateDescriptionToPolish(sourceText);
      }
    }
    $("pokemonModalType").textContent="Typ: "+creature.type;
    $("pokemonModalDesc").textContent=displayedDescription || "Nie udało się pobrać opisu. Spróbuj ponownie za chwilę.";
  }catch(err){
    $("pokemonModalType").textContent="Typ: "+creature.type;
    $("pokemonModalDesc").textContent=creature.desc+" (Nie udało się pobrać dodatkowych danych — sprawdź połączenie z internetem.)";
  }
}
function closePokemonPopup(){$("pokemonModal").classList.remove("open")}
$("pokemonModalClose").addEventListener("click",closePokemonPopup);
$("pokemonModalOk").addEventListener("click",closePokemonPopup);
$("pokemonModal").addEventListener("click",e=>{if(e.target===$("pokemonModal"))closePokemonPopup()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closePokemonPopup()});
// 5. DŹWIĘK ZDOBYCIA POKÉMONA
let captureAudioContext=null;
function unlockCaptureAudio(){
  try{const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;if(!captureAudioContext)captureAudioContext=new AudioCtx();if(captureAudioContext.state==="suspended")captureAudioContext.resume().catch(()=>{});}catch(err){console.debug("Dźwięk złapania niedostępny",err)}
}
async function playCaptureSound(){
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;
    if(!captureAudioContext)captureAudioContext=new AudioCtx();
    const ctx=captureAudioContext;if(ctx.state==="closed")return;
    // Wznowienie musi się zakończyć przed zaplanowaniem nut; inaczej po skanowaniu
    // asynchronicznym część przeglądarek może odrzucić lub zgubić dźwięk.
    if(ctx.state==="suspended")await ctx.resume();
    if(ctx.state!=="running")return;
    // Oryginalna, lokalnie syntezowana fanfara w stylu retro 8-bit.
    const notes=[659.25,783.99,987.77,1318.51,987.77,1174.66,1567.98],start=ctx.currentTime+0.04;
    notes.forEach((frequency,index)=>{const at=start+index*0.12,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type="square";osc.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(0.0001,at);gain.gain.exponentialRampToValueAtTime(0.075,at+0.012);gain.gain.exponentialRampToValueAtTime(0.0001,at+0.105);osc.connect(gain);gain.connect(ctx.destination);osc.start(at);osc.stop(at+0.11)});
  }catch(err){console.debug("Nie udało się odtworzyć dźwięku złapania",err)}
}
// 6. WERYFIKACJA KODU PRODUKTU
async function lookupEligibleBeverage(ean){
  const fields="product_name,categories,categories_tags,packaging,packaging_tags,brands,quantity";
  const endpoints=["https://world.openfoodfacts.org/api/v2/product/","https://world.openfoodfacts.net/api/v2/product/"];
  let data=null,requestFailed=false,notFound=false,successfulResponse=false;
  for(const base of endpoints){
    try{
      const response=await fetch(base+encodeURIComponent(ean)+".json?fields="+fields,{headers:{"Accept":"application/json"}});
      if(response.status===404){successfulResponse=true;notFound=true;continue}
      if(!response.ok){requestFailed=true;continue}
      successfulResponse=true;
      const candidate=await response.json();
      if(candidate.status===1&&candidate.product){data=candidate;break}
      if(candidate.status===0){notFound=true;continue}
      requestFailed=true;
    }catch(err){requestFailed=true}
  }
  if(!data||data.status!==1||!data.product){
    if(!successfulResponse&&requestFailed){
      return {ok:false,reason:"Nie udało się połączyć z bazą produktów (błąd sieci lub serwera). Spróbuj ponownie; niczego nie dodano.",code:"network_error"};
    }
    return {ok:false,reason:notFound
      ?"Nie znaleziono tego kodu w Open Food Facts. Jeśli to rzeczywiście napój w butelce lub puszce, możesz potwierdzić to ręcznie."
      :"Baza nie zwróciła rozpoznawalnego wyniku. Niczego nie dodano.",code:"not_found",needsConfirmation:true};
  }
  const p=data.product;
  const categoryText=[p.product_name||"",p.brands||"",p.categories||"",...(p.categories_tags||[])].join(" ").toLocaleLowerCase("pl");
  const beveragePattern=/(beverages?|drinks?|waters?|soft drinks?|sodas?|lemonades?|juices?|nectars?|beer|beers|wines?|ciders?|spirits|alcoholic beverages?|non-alcoholic|energy drinks?|sports drinks?|iced teas?|teas|coffees|kombucha|flavou?red milk|chocolate drinks?|plant-based beverages?|milk substitutes|napoje|woda|soki|piwa|wino|napoj[eó]w|lemoniad|herbat|kaw[aoyę]|energetyczn|izotonik|alkohol)/i;
  const name=p.product_name||p.brands||"";
  const packagingText=[p.packaging||"",...(p.packaging_tags||[])].join(" ").toLocaleLowerCase("pl");
  const bottleOrCan=/(bottles?|bouteilles?|butelk\w*|flaschen?|bottiglie|botellas?|glass[- ]bottle|plastic[- ]bottle|cans?|canettes?|puszk\w*|dosen|lattine|latas?|aluminium[- ]can|aluminum[- ]can|metal[- ]can|canette)/i.test(packagingText);
  if(!beveragePattern.test(categoryText)||!bottleOrCan){
    return {ok:false,reason:"Baza znalazła produkt ("+(name||"bez nazwy")+") ale nie potwierdza jednoznacznie, że to napój w butelce lub puszce. Jeśli sprawdziłeś etykietę, możesz potwierdzić to ręcznie.",code:"incomplete_metadata",needsConfirmation:true,productName:name};
  }
  return {ok:true,productName:name||"Napój"};
}
// 7. GŁÓWNA AKCJA: ZBIERANIE POKÉMONA
// Sprawdzenie -> przyznanie postaci i XP -> zapis -> odświeżenie widoku.
async function collect(raw){
  const ean=String(raw??"").trim();
  if(!validEAN(ean)){message("Wpisz kod kreskowy o długości 8, 12, 13 lub 14 cyfr.");return false}
  if(!state){message("Aplikacja jeszcze się uruchamia. Spróbuj ponownie za chwilę.");return false}
  message("Sprawdzam, czy kod należy do napoju w butelce lub puszce…");
  let product;
  try{product=await lookupEligibleBeverage(ean)}catch(err){
    message("Nie udało się zweryfikować produktu. Sprawdź internet i spróbuj ponownie; niczego nie dodano.");
    return false;
  }
  if(!product.ok){
    if(product.needsConfirmation){
      const detail=product.productName?"\n\nProdukt z bazy: "+product.productName:"";
      const accepted=window.confirm(product.reason+detail+"\n\nPotwierdzasz, że skanowany produkt to napój w butelce lub puszce?");
      if(!accepted){message("Nie dodano Pokémona — produkt nie został potwierdzony.");return false}
      product={ok:true,productName:product.productName||"Napój (potwierdzony ręcznie)"};
    }else{message(product.reason);return false}
  }
  let previous=state.entries[ean];
  const isDuplicate=!!previous;
  let creature=previous?CREATURES.find(c=>c.id===previous.creatureId):chooseCreature(ean);
  if(!creature)creature=chooseCreature(ean);
  state.scans=(Number(state.scans)||0)+1;
  state.xp=(Number(state.xp)||0)+(isDuplicate?1:5);
  const now=new Date().toISOString();
  if(isDuplicate){
    previous.creatureId=creature.id;
    previous.xp=(Number(previous.xp)||0)+1;
    previous.times=(Number(previous.times)||1)+1;
    previous.lastSeen=now;
    message("Potwierdzono napój: "+product.productName+". Duplikat! "+creature.name+" zdobywa 1 XP.");
  }else{
    state.entries[ean]={ean,creatureId:creature.id,xp:0,times:1,firstSeen:now,lastSeen:now};
    // Po pierwszym odkryciu przełącz widok na zebrane Pokémony.
    if($("collectionFilter")&&$("collectionFilter").value==="all"&&Object.keys(state.entries).length===1){
      $("collectionFilter").value="found";
    }
    playCaptureSound();
    message("Napój potwierdzony: "+product.productName+". Odkryto: "+creature.name+" ✨! +5 XP");
  }
  try{showPokemonPopup(creature,isDuplicate)}catch(err){console.error("Nie udało się pokazać okna Pokémona",err)}
  $("ean").value="";
  try{await store.save(state)}catch(err){
    console.error("Nie udało się zapisać kolekcji",err);
    message("Pokémon został znaleziony, ale nie udało się zapisać danych. Sprawdź ustawienia prywatności przeglądarki.");
  }
  try{render()}catch(err){console.error("Nie udało się odświeżyć kolekcji",err)}
  return true;
}
$("search").addEventListener("input",render);
$("collectionFilter").addEventListener("change",render);
$("collection").addEventListener("click",e=>{const card=e.target.closest("[data-pokemon]");if(!card||e.target.closest("a"))return;const creature=CREATURES.find(x=>x.dex===Number(card.dataset.pokemon));if(creature)showPokedexDetails(creature)});
$("collection").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-pokemon]")){e.preventDefault();const creature=CREATURES.find(x=>x.dex===Number(e.target.dataset.pokemon));if(creature)showPokedexDetails(creature)}});
$("add").addEventListener("click",()=>{unlockCaptureAudio();collect($("ean").value)});$("ean").addEventListener("keydown",e=>{if(e.key==="Enter"){unlockCaptureAudio();collect($("ean").value)}});
$("export").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="kaucja-poksy-zapis.json";a.click();URL.revokeObjectURL(url);message("Przygotowano kopię zapisu.")});
$("reset").addEventListener("click",async()=>{if(confirm("Na pewno usunąć całą kolekcję z tej przeglądarki? Tej operacji nie można cofnąć.")){state={version:1,xp:0,scans:0,entries:{}};await store.save(state);render();message("Zapis wyczyszczony.")}});
// 8. SKANER KAMERĄ
async function startCamera(){
  if(scanSucceeded){scanSucceeded=false}
  const generation=++scanGeneration;
  if(!window.isSecureContext){
    message("Kamera wymaga bezpiecznego połączenia HTTPS. Otwórz stronę przez https://.");
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    message("Ta przeglądarka nie udostępnia kamery. Otwórz stronę w aktualnym Safari.");
    return;
  }
  if(!window.ZXingBrowser || !window.ZXingBrowser.BrowserMultiFormatReader){
    message("Nie załadował się skaner kodów (ZXing). Sprawdź połączenie z internetem i odśwież stronę.");
    return;
  }
  try{
    $("start").disabled=true;
    $("video").classList.add("active");
    // Give product-barcode decoding more effort and limit formats to common retail codes.
    const hints=new Map();
    const Hint=ZXingBrowser.DecodeHintType;
    const Format=ZXingBrowser.BarcodeFormat;
    if(Hint&&Hint.TRY_HARDER)hints.set(Hint.TRY_HARDER,true);
    if(Hint&&Hint.POSSIBLE_FORMATS&&Format){
      const formats=[Format.EAN_13,Format.EAN_8,Format.UPC_A,Format.UPC_E].filter(Boolean);
      if(formats.length)hints.set(Hint.POSSIBLE_FORMATS,formats);
    }
    const reader=new ZXingBrowser.BrowserMultiFormatReader(hints.size?hints:undefined,{delayBetweenScanAttempts:100,delayBetweenScanSuccess:350});
    message("Uruchamiam kamerę i skaner kodów…");
    // Let ZXing acquire the camera and attach its stream to the preview itself.
    // This is the library's standard path and avoids attaching the same stream twice on iOS Safari.
    scanAttempts=0;lastScanDebug=Date.now();
    const onDecode=(result,error)=>{
      if(generation!==scanGeneration||scanSucceeded)return;
      scanAttempts++;
      if(result){
        const code=result.getText();
        if(code && code!==scanTimer){
          scanSucceeded=true;
          scanTimer=code;
          scanGeneration++;
          if(zxingControls){try{zxingControls.stop()}catch{}zxingControls=null}
          const video=$("video");
          const tracks=video.srcObject&&video.srcObject.getTracks?video.srcObject.getTracks():[];
          tracks.forEach(track=>track.stop());
          video.srcObject=null;
          video.classList.remove("active");
          $("start").disabled=false;
          $("stop").disabled=true;
          collect(code).then(()=>{scanTimer=null}).catch(()=>message("Odczytano kod, ale nie udało się zapisać wyniku."));
          return;
        }
      }
      // Misses are normal while the camera is looking for a barcode.
      const errorText=error&&String(error.message||error);
      const normalMiss=!!(!result && errorText && /No MultiFormat Readers were able to detect the code|NotFoundException/i.test(errorText));
      if(error && !normalMiss && !["NotFoundException","ChecksumException","FormatException","e"].includes(error.name)){
        message("Błąd dekodera: "+(error.name||"nieznany")+" — "+(error.message||"brak szczegółów"));
      }else if(Date.now()-lastScanDebug>4000){
        lastScanDebug=Date.now();
        const video=$("video");
        const track=video.srcObject&&video.srcObject.getVideoTracks?video.srcObject.getVideoTracks()[0]:null;
        const settings=track&&track.getSettings?track.getSettings():{};
        message("Skaner analizuje obraz ("+(video.videoWidth||0)+"×"+(video.videoHeight||0)+", prób: "+scanAttempts+(settings.facingMode?", kamera: "+settings.facingMode:"")+"). Ustaw kod poziomo, wypełnij nim kadr i unikaj odblasków.");
      }
    };
    // Prefer the rear camera on phones instead of accepting the browser's default camera.
    zxingControls=await reader.decodeFromConstraints(
      {video:{
        facingMode:{ideal:"environment"},
        width:{ideal:1920},
        height:{ideal:1080},
        frameRate:{ideal:30},
        advanced:[{focusMode:"continuous"},{exposureMode:"continuous"},{whiteBalanceMode:"continuous"}]
      }},
      $("video"),
      onDecode
    );
    $("stop").disabled=false;
    message("Skaner działa. Czytnik używa dokładniejszego trybu dekodowania i automatycznej ostrości, jeśli kamera ją obsługuje.");
  }catch(e){
    const name=e&&e.name?e.name:"";
    if(name==="NotAllowedError"||name==="SecurityError"){
      message("Brak dostępu do kamery. Zezwól na kamerę w ustawieniach Safari dla tej strony.");
    }else if(name==="NotFoundError"||name==="DevicesNotFoundError"){
      message("Nie znaleziono kamery w tym urządzeniu.");
    }else if(name==="NotReadableError"||name==="TrackStartError"){
      message("Kamera jest zajęta przez inną aplikację. Zamknij ją i spróbuj ponownie.");
    }else{
      message("Nie udało się uruchomić skanera ("+(name||"błąd nieznany")+"). Odśwież stronę i spróbuj ponownie.");
    }
    stopCamera();
  }
}
function stopCamera(){scanGeneration++;scanning=false;if(zxingControls){try{zxingControls.stop()}catch{}zxingControls=null}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null} $("video").srcObject=null;$("video").classList.remove("active");$("start").disabled=false;$("stop").disabled=true}
$("start").addEventListener("click",()=>{unlockCaptureAudio();startCamera()});$("stop").addEventListener("click",stopCamera);
// 9. URUCHOMIENIE APLIKACJI
store.load().then(data=>{
  state={version:1,xp:Number(data.xp)||0,scans:Number(data.scans)||0,entries:data.entries&&typeof data.entries==="object"?data.entries:{}};
  // Przy otwarciu aplikacji pokaż odkryte wpisy, jeśli kolekcja nie jest pusta.
  if(Object.keys(state.entries).length>0&&$("collectionFilter")&&$("collectionFilter").value==="all"){
    $("collectionFilter").value="found";
  }
  render();
});
window.addEventListener("pagehide",stopCamera);
