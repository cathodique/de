
export class WithTransfer {
  data: any;
  transfer: any[];
  constructor(data: any, transfer: any[] = []) {
    this.data = data;
    this.transfer = transfer;
  }
  clone() {
    return new WithTransfer(this.data, this.transfer);
  }
}
