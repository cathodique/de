
export class WithTransfer {
  data: any;
  transfer: any[];
  constructor(data: any, transfer: any[] = []) {
    if (data instanceof WithTransfer) {
      this.data = data.data;
      this.transfer = [...data.transfer, ...transfer];
    } else {
      this.data = data;
      this.transfer = transfer;
    }
  }
  clone() {
    return new WithTransfer(this.data, this.transfer);
  }
}
