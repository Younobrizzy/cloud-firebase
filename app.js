import{initializeApp}from"https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";import{getAuth,signInWithEmailAndPassword}from"https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";import{getFirestore}from"https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const loginView=document.getElementById("loginView"),contactView=document.getElementById("contactView"),loginForm=document.getElementById("loginForm"),email=document.getElementById("email"),password=document.getElementById("password"),message=document.getElementById("message"),loginButton=document.getElementById("loginButton"),contactForm=document.getElementById("contactForm"),contactStatus=document.getElementById("contactStatus");
let auth,db;

function msg(el,text,error=true){el.textContent=text;el.style.color=error?"#dc2626":"#15803d"}
function showContact(){loginView.classList.add("hidden");contactView.classList.remove("hidden");document.title="Contact";document.getElementById("name").focus()}

async function init(){
 const r=await fetch("/api/config",{headers:{Accept:"application/json"},cache:"no-store"});
 const type=r.headers.get("content-type")||"";
 if(!r.ok)throw new Error(`Configuration endpoint returned HTTP ${r.status}: ${await r.text()}`);
 if(!type.includes("application/json"))throw new Error(`Configuration endpoint did not return JSON. Received: ${(await r.text()).slice(0,100)}`);
 const config=await r.json(),app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);
}
loginForm.addEventListener("submit",async e=>{
 e.preventDefault();if(!auth)return msg(message,"Firebase is still initializing. Please try again.");
 msg(message,"");loginButton.disabled=true;loginButton.textContent="Logging in...";
 try{await signInWithEmailAndPassword(auth,email.value.trim(),password.value);showContact()}
 catch(err){const m={"auth/invalid-credential":"Invalid email or password.","auth/invalid-email":"Please enter a valid email address.","auth/user-disabled":"This account has been disabled.","auth/too-many-requests":"Too many attempts. Please try again later."};msg(message,m[err.code]||err.message||"Unable to log in.")}
 finally{loginButton.disabled=false;loginButton.textContent="Login"}
});
contactForm.addEventListener("submit",e=>{e.preventDefault();msg(contactStatus,"Message form is ready. Connect the submit action to your backend to send it.",false)});
init().catch(err=>{console.error(err);msg(message,err.message||"Unable to initialize the application.")});