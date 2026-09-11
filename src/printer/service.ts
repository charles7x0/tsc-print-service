import type { SettingsRepository } from '../db/settingsRepository.js';
import type { Settings } from '../db/settings.js';
import { buildLabel, buildRawProgram } from '../tspl/builder.js';
import { buildTestLabelSpec, buildDefectTagSpec, type GaugeInput } from '../tspl/layouts.js';
import type { LabelGeometry, LabelSpec } from '../tspl/types.js';
import {
  DryRunTransport,
  NetworkTransport,
  probeConnection,
  type PrinterTarget,
  type PrinterTransport,
  type ProbeResult,
  type SendResult,
} from './transport.js';

/**
 * Coordinates building TSPL and sending it through a transport.
 *
 * Settings are read from the SettingsRepository on each print, so changes made
 * through the settings API take effect immediately without a restart. A
 * transport can be injected for testing; otherwise one is chosen per-print
 * based on the current `dryRun` setting.
 */
export class PrinterService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly injectedTransport?: PrinterTransport,
  ) {}

  /** Resolve the transport to use, honouring an injected one for tests. */
  private transportFor(settings: Settings): PrinterTransport {
    if (this.injectedTransport) return this.injectedTransport;
    return settings.printer.dryRun
      ? new DryRunTransport()
      : new NetworkTransport({
          ip: settings.printer.ip,
          port: settings.printer.port,
          timeoutMs: settings.printer.timeoutMs,
        });
  }

  /** Default geometry derived from current settings. */
  defaultGeometry(): LabelGeometry {
    const { label } = this.settings.getSettings();
    return {
      widthMm: label.widthMm,
      heightMm: label.heightMm,
      gapMm: label.gapMm,
      direction: label.direction,
      mirror: label.mirror,
    };
  }

  /** Send a fully-specified label. */
  async printLabel(spec: LabelSpec): Promise<{ result: SendResult; tspl: string }> {
    const tspl = buildLabel(spec);
    const result = await this.transportFor(this.settings.getSettings()).send(tspl);
    return { result, tspl };
  }

  /** Send a raw list of TSPL command lines. */
  async printRaw(commands: string[]): Promise<{ result: SendResult; tspl: string }> {
    const tspl = buildRawProgram(commands);
    const result = await this.transportFor(this.settings.getSettings()).send(tspl);
    return { result, tspl };
  }

  /**
   * Test whether the printer is reachable. Uses the given target override if
   * provided (so the UI can test before saving), otherwise the saved settings.
   * Resolves with a ProbeResult even on failure (never throws).
   */
  async testConnection(override?: Partial<PrinterTarget>): Promise<ProbeResult> {
    const { printer } = this.settings.getSettings();
    const target: PrinterTarget = {
      ip: override?.ip ?? printer.ip,
      port: override?.port ?? printer.port,
      timeoutMs: override?.timeoutMs ?? printer.timeoutMs,
    };
    return probeConnection(target);
  }

  /** Print the built-in demo/test label using current geometry. */
  async printTestLabel(landscape: boolean): Promise<{ result: SendResult; tspl: string }> {
    const spec = buildTestLabelSpec({
      geometry: this.defaultGeometry(),
      landscape,
    });
    return this.printLabel(spec);
  }

  /**
   * Print the parameterized Defect Analysis Tag. Coordinates are computed from
   * the current label geometry + DPI, so it fits any label size without
   * overflow or collision.
   */
  async printDefectTag(input: {
    id: string;
    timestamp: string;
    gauges: GaugeInput[];
    qrData?: string;
    footer?: string;
    direction?: 0 | 1;
  }): Promise<{ result: SendResult; tspl: string }> {
    const settings = this.settings.getSettings();
    const geometry = this.defaultGeometry();
    if (input.direction !== undefined) geometry.direction = input.direction;

    const spec = buildDefectTagSpec({
      geometry,
      dpmm: settings.label.dpmm,
      id: input.id,
      timestamp: input.timestamp,
      gauges: input.gauges,
      qrData: input.qrData,
      footer: input.footer,
    });
    return this.printLabel(spec);
  }
}
