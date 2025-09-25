#!/usr/bin/env node
import http from "http";
import https from "https";

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith("--")){const k=a.slice(2);const v=argv[i+1]&&!argv[i+1].startsWith("--")?argv[++i]:true;o[k]=v;}}return o;}

function clientFor(u){return u.protocol==="https:"?https:http;}

async function httpGet(baseUrl, path, token){
  const u=new URL(path, baseUrl); const c=clientFor(u);
  return new Promise((resolve,reject)=>{
    const req=c.request({method:"GET",hostname:u.hostname,port:u.port||(u.protocol==="https:"?443:80),path:u.pathname+(u.search||""),headers:{...(token?{Authorization:`Bearer ${token}`}:{})},rejectUnauthorized:false},(res)=>{
      const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>{const txt=Buffer.concat(chunks).toString("utf8");try{resolve({status:res.statusCode,json:JSON.parse(txt)})}catch{resolve({status:res.statusCode,text:txt})}})});
    req.on("error",reject);req.end();
  });
}

async function httpPost(baseUrl, path, body, token){
  const u=new URL(path, baseUrl); const c=clientFor(u);
  return new Promise((resolve,reject)=>{
    const data=Buffer.from(JSON.stringify(body));
    const req=c.request({method:"POST",hostname:u.hostname,port:u.port||(u.protocol==="https:"?443:80),path:u.pathname+(u.search||""),headers:{"Content-Type":"application/json","Content-Length":data.length,...(token?{Authorization:`Bearer ${token}`}:{})},rejectUnauthorized:false},(res)=>{
      const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>{const txt=Buffer.concat(chunks).toString("utf8");try{resolve({status:res.statusCode,json:JSON.parse(txt)})}catch{resolve({status:res.statusCode,text:txt})}})});
    req.on("error",reject);req.write(data);req.end();
  });
}

function defaultsForTarget(name){
  if(name==="dev") return { dir: process.env.TEST_REMOTE_DIR_DEV||process.env.TEST_REMOTE_DIR||"/var/services/homes/svc_mcp", scan: process.env.SELFTEST_REMOTE_SCAN_DIR_DEV||process.env.SELFTEST_REMOTE_SCAN_DIR||"/var/services/homes/svc_mcp" };
  if(name==="personal") return { dir: process.env.TEST_REMOTE_DIR_PERSONAL||process.env.TEST_REMOTE_DIR||"/volume1/public", scan: process.env.SELFTEST_REMOTE_SCAN_DIR_PERSONAL||process.env.SELFTEST_REMOTE_SCAN_DIR||"/volume1/public" };
  return { dir: process.env.TEST_REMOTE_DIR||"/tmp", scan: process.env.SELFTEST_REMOTE_SCAN_DIR||"/tmp" };
}

async function main(){
  const args=parseArgs(process.argv);
  const base=args.url||process.env.HTTP_BASE_URL||"http://localhost:8765";
  const token=args.token||process.env.API_TOKEN||"";
  const quick=!!args.quick;

  const summary={ base, ts:new Date().toISOString(), health:null, targets:[], checks:{} };
  try {
    const h=await httpGet(base, "/health", token);
    summary.health=h;
    if(h.json&&h.json.targets) summary.targets=h.json.targets; else summary.targets=["dev","personal"];
  } catch(e){ summary.health={ error:e.message }; summary.targets=["dev","personal"]; }

  for(const t of summary.targets){
    const res={ exec:null, write: quick? { skipped:true }: null, read: quick? { skipped:true }: null, scan: quick? { skipped:true }: null, admin:{ storage:null, docker:null }, dsm:{ login:null, list: null } };
    const def=defaultsForTarget(t);
    const testFile=`${def.dir.replace(/\/$/,'')}/mcp-report-${Date.now()}.txt`;
    try { res.exec=await httpPost(base, "/tools/exec", { target:t, command:"uname -a" }, token); } catch(e){ res.exec={ error:e.message }; }
    if(!quick){
      try { res.write=await httpPost(base, "/tools/write", { target:t, remotePath:testFile, content:"report-OK", encoding:"utf8" }, token); } catch(e){ res.write={ error:e.message }; }
      try { res.read=await httpPost(base, "/tools/read", { target:t, remotePath:testFile }, token); if(res.read&&res.read.json&&res.read.json.content){ res.read.ok = (res.read.json.content==='report-OK') || false; } } catch(e){ res.read={ error:e.message }; }
      try { res.scan=await httpPost(base, "/housekeeping/scan", { target:t, dir:def.scan, minSizeMB:1, olderThanDays:1 }, token); } catch(e){ res.scan={ error:e.message }; }
    }
    try { res.admin.storage=await httpPost(base, "/admin/storage-summary", { target:t }, token); } catch(e){ res.admin.storage={ error:e.message }; }
    try { res.admin.docker=await httpPost(base, "/admin/docker-list", { target:t }, token); } catch(e){ res.admin.docker={ error:e.message }; }
    try { res.dsm.login=await httpPost(base, "/dsm/login", { target:t }, token); } catch(e){ res.dsm.login={ error:e.message }; }
    if(res.dsm.login && res.dsm.login.status===200){
      try { res.dsm.list=await httpPost(base, "/dsm/list", { target:t, path:"/volume1" }, token); } catch(e){ res.dsm.list={ error:e.message }; }
    }
    summary.checks[t]=res;
  }

  console.log(JSON.stringify(summary,null,2));
}

main().catch(e=>{ console.error("Report error:", e.message); process.exit(1); });
