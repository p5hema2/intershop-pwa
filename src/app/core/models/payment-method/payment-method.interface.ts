import { PaymentInstrument } from '../payment-instrument/payment-instrument.model';
import { PaymentRestriction } from '../payment-restriction/payment-restriction.model';
import { PriceItem } from '../price-item/price-item.interface';

export interface PaymentMethodParameterType {
  type: string;
  name: string;
  displayName: string;
  description?: string;
  hidden?: boolean;
  options?: { displayName: string; id: string }[];
  constraints?: {
    required?: { message?: string };
    size?: { min?: number; max?: number; message?: string };
    pattern?: { regexp: string; message?: string };
  };
}

// tslint:disable-next-line:project-structure
export interface PaymentMethodBaseData {
  id: string;
  displayName: string;
  description?: string;
  capabilities?: string[];
  restricted?: boolean;
  restrictions?: PaymentRestriction[];
  paymentCosts?: PriceItem;
  paymentCostsThreshold?: PriceItem;
  paymentInstruments?: string[];
  parameterDefinitions?: PaymentMethodParameterType[];
}

export interface PaymentMethodData {
  data: PaymentMethodBaseData[];
  included: {
    paymentInstruments: {
      [id: string]: PaymentInstrument;
    };
  };
}
