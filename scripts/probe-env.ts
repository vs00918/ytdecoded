import { execSync } from 'child_process';

function probeEnv() {
  const vars = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_MODEL', 'OPENAI_MODEL', 'LLM_PROVIDER'];
  
  console.log('--- Checking Process Environment ---');
  for (const v of vars) {
    console.log(`${v}: ${process.env[v] ? `SET (length ${process.env[v].length})` : 'NOT SET'}`);
  }

  console.log('\n--- Checking Windows User Registry ---');
  for (const v of vars) {
    try {
      const out = execSync(`powershell -Command "[System.Environment]::GetEnvironmentVariable('${v}', [System.EnvironmentVariableTarget]::User)"`, { encoding: 'utf8' }).trim();
      console.log(`User Registry ${v}: ${out.length > 0 ? `FOUND (length ${out.length})` : 'NOT SET'}`);
      if (out.length > 0) {
        process.env[v] = out;
      }
    } catch (e: any) {
      console.log(`User Registry ${v}: ERROR (${e.message})`);
    }
  }

  console.log('\n--- Checking Windows Machine Registry ---');
  for (const v of vars) {
    try {
      const out = execSync(`powershell -Command "[System.Environment]::GetEnvironmentVariable('${v}', [System.EnvironmentVariableTarget]::Machine)"`, { encoding: 'utf8' }).trim();
      console.log(`Machine Registry ${v}: ${out.length > 0 ? `FOUND (length ${out.length})` : 'NOT SET'}`);
      if (out.length > 0 && !process.env[v]) {
        process.env[v] = out;
      }
    } catch (e: any) {
      console.log(`Machine Registry ${v}: ERROR (${e.message})`);
    }
  }
}

probeEnv();
