import {
  CronCapability,
  HTTPClient,
  EVMClient,
  handler,
  consensusIdenticalAggregation,
  Runner,
  getNetwork,
  hexToBase64,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk"
import { encodeAbiParameters, parseAbiParameters } from "viem"

// EscrowVault.Status enum (uint8 at the ABI boundary).
export const Status = { Open: 0, Closed: 1, Dismissed: 2 } as const

// Logical id of the Socrata app token, injected as a CRE secret (never committed).
const SOCRATA_TOKEN_SECRET = "SOCRATA_APP_TOKEN"
const SOCRATA_URL = "https://data.cityofnewyork.us/resource/wvxf-dwi5.json"

type Escrow = {
  id: number // EscrowVault escrow id (used in the report)
  violationId: number // HPD ViolationID (queried on Socrata)
}

type Config = {
  schedule: string // cron schedule, e.g. "0 */5 * * * *"
  consumerAddress: string // EscrowVaultReceiver (the CRE consumer contract)
  chainSelector: string // chain-selector NAME for getNetwork, e.g. "arc-testnet"
  gasLimit: string // gas limit for writeReport
  escrows: Escrow[] // escrows to track: { id, violationId }
}

export type SocrataRow = { violationstatus?: string; currentstatus?: string }

/// Map HPD fields -> EscrowVault.Status (uint8).
/// violationstatus "Open" -> Open; "Close" + currentstatus contains "DISMISS" -> Dismissed;
/// any other "Close" -> Closed. Missing data -> Open (stay locked; never settle on no data).
export const mapStatus = (row?: SocrataRow): number => {
  if (!row || !row.violationstatus) return Status.Open
  const vs = row.violationstatus.trim().toUpperCase()
  if (vs === "OPEN") return Status.Open
  const cs = (row.currentstatus ?? "").toUpperCase()
  return cs.includes("DISMISS") ? Status.Dismissed : Status.Closed
}

/// Runs on each DON node: fetch the HPD row for one violation and map it to a Status.
/// JSON parsing + mapping happen here so consensus aggregates the final status value
/// (not raw, possibly-differing HTTP bytes).
const fetchStatus = (nodeRuntime: NodeRuntime<Config>, violationId: number, appToken: string): number => {
  const httpClient = new HTTPClient()
  const url = `${SOCRATA_URL}?violationid=${violationId}&$select=violationstatus,currentstatus`

  const resp = httpClient
    .sendRequest(nodeRuntime, {
      url,
      method: "GET" as const,
      headers: { "X-App-Token": appToken },
    })
    .result()

  const rows = JSON.parse(new TextDecoder().decode(resp.body)) as SocrataRow[]
  return mapStatus(rows[0])
}

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

const onCronTrigger = (runtime: Runtime<Config>): string => {
  const config = runtime.config
  const appToken = runtime.getSecret({ id: SOCRATA_TOKEN_SECRET }).result().value

  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainSelector })
  if (!network) {
    throw new Error(`Unknown chain selector name: ${config.chainSelector}`)
  }
  const evmClient = new EVMClient(network.chainSelector.selector)

  let posted = 0
  for (const escrow of config.escrows) {
    // Off-chain consensus on the mapped HPD status for this escrow's violation.
    const status = runtime
      .runInNodeMode(
        (nodeRuntime: NodeRuntime<Config>) => fetchStatus(nodeRuntime, escrow.violationId, appToken),
        consensusIdenticalAggregation<number>()
      )()
      .result()

    runtime.log(`escrow ${escrow.id} (violation ${escrow.violationId}) -> status ${status}`)

    // Open is non-terminal: nothing to settle, so don't post (saves gas).
    if (status === Status.Open) continue

    // Payload MUST match EscrowVaultReceiver._processReport: abi.decode(report,(uint256,uint8)).
    const reportData = encodeAbiParameters(parseAbiParameters("uint256 id, uint8 status"), [
      BigInt(escrow.id),
      status,
    ])

    // Generate the DON-signed report.
    const report = runtime
      .report({
        encodedPayload: hexToBase64(reportData),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result()

    // Deliver it to the receiver via the forwarder -> _processReport -> vault.updateStatus.
    evmClient
      .writeReport(runtime, {
        receiver: config.consumerAddress,
        report,
        gasConfig: { gasLimit: config.gasLimit },
      })
      .result()

    posted++
    runtime.log(`posted status ${status} for escrow ${escrow.id}`)
  }

  return `done: posted ${posted}/${config.escrows.length} status update(s)`
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
