import { HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Store, select } from '@ngrx/store';
import { EMPTY, Observable, forkJoin, iif, of, throwError } from 'rxjs';
import { catchError, concatMap, first, map, take } from 'rxjs/operators';

import { AddressMapper } from 'ish-core/models/address/address.mapper';
import { Address } from 'ish-core/models/address/address.model';
import { Attribute } from 'ish-core/models/attribute/attribute.model';
import { BasketInfoMapper } from 'ish-core/models/basket-info/basket-info.mapper';
import { BasketInfo } from 'ish-core/models/basket-info/basket-info.model';
import { BasketMergeHelper } from 'ish-core/models/basket-merge/basket-merge.helper';
import { BasketMergeData } from 'ish-core/models/basket-merge/basket-merge.interface';
import { BasketValidationData } from 'ish-core/models/basket-validation/basket-validation.interface';
import { BasketValidationMapper } from 'ish-core/models/basket-validation/basket-validation.mapper';
import { BasketValidation, BasketValidationScopeType } from 'ish-core/models/basket-validation/basket-validation.model';
import { BasketBaseData, BasketData } from 'ish-core/models/basket/basket.interface';
import { BasketMapper } from 'ish-core/models/basket/basket.mapper';
import { Basket } from 'ish-core/models/basket/basket.model';
import { ErrorFeedback } from 'ish-core/models/http-error/http-error.model';
import { LineItemData } from 'ish-core/models/line-item/line-item.interface';
import { LineItemMapper } from 'ish-core/models/line-item/line-item.mapper';
import { LineItem, LineItemView } from 'ish-core/models/line-item/line-item.model';
import { SkuQuantityType } from 'ish-core/models/product/product.model';
import { ShippingMethodData } from 'ish-core/models/shipping-method/shipping-method.interface';
import { ShippingMethodMapper } from 'ish-core/models/shipping-method/shipping-method.mapper';
import { ShippingMethod } from 'ish-core/models/shipping-method/shipping-method.model';
import { ApiService, AvailableOptions, unpackEnvelope } from 'ish-core/services/api/api.service';
import { OrderService } from 'ish-core/services/order/order.service';
import { getBasketIdOrCurrent, getCurrentBasket } from 'ish-core/store/customer/basket';
import { encodeResourceID } from 'ish-core/utils/url-resource-ids';

export type BasketUpdateType =
  | { invoiceToAddress: string }
  | { commonShipToAddress: string }
  | { commonShippingMethod: string }
  | { costCenter: string }
  | { calculated: boolean }
  | { messageToMerchant: string };

export type BasketItemUpdateType =
  | { quantity?: { value: number; unit: string }; product?: string }
  | { shippingMethod?: { id: string } }
  | { desiredDelivery?: string }
  | { calculated: boolean };

type BasketIncludeType =
  | 'invoiceToAddress'
  | 'commonShipToAddress'
  | 'commonShippingMethod'
  | 'discounts'
  | 'lineItems_discounts'
  | 'lineItems'
  | 'payments'
  | 'payments_paymentMethod'
  | 'payments_paymentInstrument';

type MergeBasketIncludeType =
  | 'targetBasket'
  | 'targetBasket_invoiceToAddress'
  | 'targetBasket_commonShipToAddress'
  | 'targetBasket_commonShippingMethod'
  | 'targetBasket_discounts'
  | 'targetBasket_lineItems_discounts'
  | 'targetBasket_lineItems'
  | 'targetBasket_payments'
  | 'targetBasket_payments_paymentMethod'
  | 'targetBasket_payments_paymentInstrument';

type ValidationBasketIncludeType =
  | 'basket'
  | 'basket_invoiceToAddress'
  | 'basket_commonShipToAddress'
  | 'basket_commonShippingMethod'
  | 'basket_discounts'
  | 'basket_lineItems_discounts'
  | 'basket_lineItems'
  | 'basket_payments'
  | 'basket_payments_paymentMethod'
  | 'basket_payments_paymentInstrument';

/**
 * The Basket Service handles the interaction with the 'baskets' REST API.
 */
@Injectable({ providedIn: 'root' })
export class BasketService {
  constructor(private apiService: ApiService, private orderService: OrderService, private store: Store) {}

  /**
   * http header for Basket API v1
   */
  private basketHeaders = new HttpHeaders({
    'content-type': 'application/json',
    Accept: 'application/vnd.intershop.basket.v1+json',
  });

  private allBasketIncludes: BasketIncludeType[] = [
    'invoiceToAddress',
    'commonShipToAddress',
    'commonShippingMethod',
    'discounts',
    'lineItems_discounts',
    'lineItems',
    'payments',
    'payments_paymentMethod',
    'payments_paymentInstrument',
  ];

  private allTargetBasketIncludes: MergeBasketIncludeType[] = [
    'targetBasket',
    'targetBasket_invoiceToAddress',
    'targetBasket_commonShipToAddress',
    'targetBasket_commonShippingMethod',
    'targetBasket_discounts',
    'targetBasket_lineItems_discounts',
    'targetBasket_lineItems',
    'targetBasket_payments',
    'targetBasket_payments_paymentMethod',
    'targetBasket_payments_paymentInstrument',
  ];

  private allBasketValidationIncludes: ValidationBasketIncludeType[] = [
    'basket',
    'basket_invoiceToAddress',
    'basket_commonShipToAddress',
    'basket_commonShippingMethod',
    'basket_discounts',
    'basket_lineItems_discounts',
    'basket_lineItems',
    'basket_payments',
    'basket_payments_paymentMethod',
    'basket_payments_paymentInstrument',
  ];

  /**
   * Basket REST API wrapper to work with the currently selected basket id or 'current' as fallback.
   */
  currentBasketEndpoint() {
    const basketUrl$ = this.store
      .pipe(
        select(getBasketIdOrCurrent),
        map(basketId => `baskets/${basketId}`)
      )
      .pipe(take(1));

    return {
      get: <T>(path: string, options?: AvailableOptions) =>
        basketUrl$.pipe(
          concatMap(basketUrl => this.apiService.get<T>(path ? `${basketUrl}/${path}` : basketUrl, options))
        ),
      delete: <T>(path: string, options?: AvailableOptions) =>
        basketUrl$.pipe(
          concatMap(basketUrl => this.apiService.delete<T>(path ? `${basketUrl}/${path}` : basketUrl, options))
        ),
      put: <T>(path: string, body = {}, options?: AvailableOptions) =>
        basketUrl$.pipe(
          concatMap(basketUrl => this.apiService.put<T>(path ? `${basketUrl}/${path}` : basketUrl, body, options))
        ),
      patch: <T>(path: string, body = {}, options?: AvailableOptions) =>
        basketUrl$.pipe(
          concatMap(basketUrl => this.apiService.patch<T>(path ? `${basketUrl}/${path}` : basketUrl, body, options))
        ),
      post: <T>(path: string, body = {}, options?: AvailableOptions) =>
        basketUrl$.pipe(
          concatMap(basketUrl => this.apiService.post<T>(path ? `${basketUrl}/${path}` : basketUrl, body, options))
        ),
    };
  }

  /**
   * Gets the currently used basket for the current user.
   *
   * @returns         The basket.
   */
  getBasket(): Observable<Basket> {
    const params = new HttpParams().set('include', this.allBasketIncludes.join());

    return this.currentBasketEndpoint()
      .get<BasketData>('', {
        headers: this.basketHeaders,
        params,
      })
      .pipe(map(BasketMapper.fromData));
  }

  /**
   * Gets the basket for the current user with the given basket id if available.
   *
   * @param basketId  The basket id for the basket to be fetched.
   * @returns         The basket.
   */
  getBasketWithId(basketId: string): Observable<Basket> {
    const params = new HttpParams().set('include', this.allBasketIncludes.join());

    return this.apiService
      .get<BasketData>(`baskets/${basketId}`, {
        headers: this.basketHeaders,
        params,
      })
      .pipe(map(BasketMapper.fromData));
  }

  /**
   * Gets the 'current' default basket for the current user authenticated by the given apiToken.
   *
   * @param apiToken  The authentication token.
   * @returns         The basket.
   */
  getBasketByToken(apiToken: string): Observable<Basket> {
    const params = new HttpParams().set('include', this.allBasketIncludes.join());

    return this.apiService
      .get<BasketData>(`baskets/current`, {
        headers: this.basketHeaders.set(ApiService.TOKEN_HEADER_KEY, apiToken),
        params,
        skipApiErrorHandling: true,
      })
      .pipe(
        map(BasketMapper.fromData),
        catchError(() => EMPTY)
      );
  }

  /**
   * Creates a new basket for the current user.
   *
   * @returns         The basket.
   */
  createBasket(): Observable<Basket> {
    return this.apiService
      .post<BasketData>(
        `baskets`,
        {},
        {
          headers: this.basketHeaders,
        }
      )
      .pipe(map(BasketMapper.fromData));
  }

  /**
   * Merge the source basket into the target basket.
   *
   * @param sourceBasketId          The id of the source basket.
   * @param sourceBasketAuthToken   The token value of the source basket owner.
   * @param targetBasketId          The id of the target basket.
   * @returns                       The merged basket.
   */
  mergeBasket(sourceBasketId: string, sourceBasketAuthToken: string, targetBasketId: string): Observable<Basket> {
    if (!sourceBasketId) {
      return throwError(() => new Error('mergeBasket() called without sourceBasketId'));
    }
    if (!sourceBasketAuthToken) {
      return throwError(() => new Error('mergeBasket() called without sourceBasketAuthToken'));
    }
    if (!targetBasketId) {
      return throwError(() => new Error('mergeBasket() called without targetBasketId'));
    }
    if (targetBasketId === sourceBasketId) {
      return throwError(() => new Error('mergeBasket() cannot be called when targetBasketId === sourceBasketId'));
    }

    const params = new HttpParams().set('include', this.allTargetBasketIncludes.join());
    return this.apiService
      .post<BasketMergeData>(
        `baskets/${targetBasketId}/merges`,
        { sourceBasket: sourceBasketId, sourceAuthenticationToken: sourceBasketAuthToken },
        {
          headers: this.basketHeaders,
          params,
        }
      )
      .pipe(map(mergeBasketData => BasketMapper.fromData(BasketMergeHelper.transform(mergeBasketData))));
  }

  /**
   * Updates the currently used basket.
   *
   * @param body      Basket related data (invoice address, shipping address, shipping method ...), which should be changed
   * @returns         The changed basket.
   */
  updateBasket(body: BasketUpdateType): Observable<Basket> {
    if (!body) {
      return throwError(() => new Error('updateBasket() called without body'));
    }

    const params = new HttpParams().set('include', this.allBasketIncludes.join());
    return this.currentBasketEndpoint()
      .patch<BasketData>('', body, {
        headers: this.basketHeaders,
        params,
      })
      .pipe(map(BasketMapper.fromData));
  }

  /**
   * Validates the currently used basket.
   *
   * @param scopes    Basket scopes which should be validated ( see also BasketValidationScopeType ), default: minimal scope (max items limit, empty basket)
   * @returns         The (adjusted) basket and the validation results.
   */
  validateBasket(scopes: BasketValidationScopeType[] = ['']): Observable<BasketValidation> {
    const body = {
      adjustmentsAllowed: !scopes.some(scope => scope === 'All'), // don't allow adjustments for 'All' validation steps, because you cannot show them to the user at once
      scopes,
    };

    const params = new HttpParams().set('include', this.allBasketValidationIncludes.join());
    return this.currentBasketEndpoint()
      .post<BasketValidationData>('validations', body, {
        headers: this.basketHeaders,
        params,
      })
      .pipe(map(BasketValidationMapper.fromData));
  }

  /**
   * Returns the list of active baskets for the current user. The first basket is the last modified basket.
   * Use this method to check if the user has at least one active basket
   *
   * @returns         An array of basket base data.
   */
  getBaskets(): Observable<BasketBaseData[]> {
    return this.apiService
      .get(`baskets`, {
        headers: this.basketHeaders,
      })
      .pipe(unpackEnvelope<BasketBaseData>('data'));
  }

  /**
   * Adds a list of items with the given sku and quantity to the currently used basket.
   *
   * @param   items       The list of product SKU and quantity pairs to be added to the basket.
   * @returns lineItems   The list of line items, that have been added to the basket.
   *          info        Info responded by the server.
   *          errors      Errors responded by the server.
   */
  addItemsToBasket(
    items: SkuQuantityType[]
  ): Observable<{ lineItems: LineItem[]; info: BasketInfo[]; errors: ErrorFeedback[] }> {
    if (!items) {
      return throwError(() => new Error('addItemsToBasket() called without items'));
    }
    return this.store.pipe(select(getCurrentBasket)).pipe(
      first(),
      concatMap(basket =>
        this.currentBasketEndpoint()
          .post<{ data: LineItemData[]; infos: BasketInfo[]; errors?: ErrorFeedback[] }>(
            'items',
            this.mapItemsToAdd(basket, items),
            {
              headers: this.basketHeaders,
            }
          )
          .pipe(
            map(payload => ({
              lineItems: payload.data.map(item => LineItemMapper.fromData(item)),
              info: BasketInfoMapper.fromInfo({ infos: payload.infos }),
              errors: payload.errors,
            }))
          )
      )
    );
  }

  private mapItemsToAdd(basket: Basket, items: SkuQuantityType[]) {
    return items.map(item => ({
      product: item.sku,
      quantity: {
        value: item.quantity,
        unit: item.unit,
      },
      // ToDo: if multi buckets will be supported setting the shipping method to the common shipping method has to be reworked
      shippingMethod: basket?.commonShippingMethod?.id,
    }));
  }

  /**
   * Add a promotion code to currently used basket.
   *
   * @param codeStr   The code string of the promotion code that should be added to basket.
   * @returns         The info message after creation.
   */
  addPromotionCodeToBasket(codeStr: string): Observable<string> {
    const body = { code: codeStr };
    return this.currentBasketEndpoint()
      .post('promotioncodes', body, {
        headers: this.basketHeaders,
      })
      .pipe(map(({ infos }) => infos?.[0]?.message));
  }

  /**
   * Remove a promotion code from the currently used basket.
   *
   * @param codeStr   The code string of the promotion code that should be removed from basket.
   */
  removePromotionCodeFromBasket(codeStr: string): Observable<string> {
    return this.currentBasketEndpoint().delete<string>(`promotioncodes/${encodeResourceID(codeStr)}`, {
      headers: this.basketHeaders,
    });
  }

  /**
   * Updates a specific line item (quantity/shipping method) of the currently used basket.
   *
   * @param itemId    The id of the line item that should be updated.
   * @param body      request body
   * @returns         The line item and possible infos after the update.
   */
  updateBasketItem(itemId: string, body: BasketItemUpdateType): Observable<{ lineItem: LineItem; info: BasketInfo[] }> {
    return this.currentBasketEndpoint()
      .patch<{ data: LineItemData; infos: BasketInfo[] }>(`items/${itemId}`, body, {
        headers: this.basketHeaders,
      })
      .pipe(
        map(payload => ({
          lineItem: LineItemMapper.fromData(payload.data),
          info: BasketInfoMapper.fromInfo({ infos: payload.infos }),
        }))
      );
  }

  /**
   * Remove specific line item from the currently used basket.
   *
   * @param itemId    The id of the line item that should be deleted.
   */
  deleteBasketItem(itemId: string): Observable<BasketInfo[]> {
    return this.currentBasketEndpoint()
      .delete<{ infos: BasketInfo[] }>(`items/${itemId}`, {
        headers: this.basketHeaders,
      })
      .pipe(
        map(payload => ({ ...payload, itemId })),
        map(BasketInfoMapper.fromInfo)
      );
  }

  /**
   * Create a basket address for the currently used basket of an anonymous user.
   *
   * @param address   The address which should be created
   * @returns         The new basket address.
   */
  createBasketAddress(address: Address): Observable<Address> {
    if (!address) {
      return throwError(() => new Error('createBasketAddress() called without address'));
    }
    return this.currentBasketEndpoint()
      .post(`addresses`, address, {
        headers: this.basketHeaders,
      })
      .pipe(
        map(({ data }) => data),
        map(AddressMapper.fromData)
      );
  }

  /**
   * Update partly or completely an address for the currently used basket of an anonymous user.
   *
   * @param address   The address data which should be updated
   * @returns         The new basket address.
   */
  updateBasketAddress(address: Address): Observable<Address> {
    if (!address) {
      return throwError(() => new Error('updateBasketAddress() called without address'));
    }
    if (!address.id) {
      return throwError(() => new Error('updateBasketAddress() called without addressId'));
    }
    return this.currentBasketEndpoint()
      .patch(`addresses/${address.id}`, address, {
        headers: this.basketHeaders,
      })
      .pipe(
        map(({ data }) => data),
        map(AddressMapper.fromData)
      );
  }

  /**
   * Get eligible shipping methods for the currently used basket or for the selected bucket of a basket.
   *
   * @param bucketId  The bucket id.
   * @returns         The eligible shipping methods.
   */
  getBasketEligibleShippingMethods(bucketId?: string): Observable<ShippingMethod[]> {
    return bucketId
      ? this.currentBasketEndpoint()
          .get(`buckets/${bucketId}/eligible-shipping-methods`, {
            headers: this.basketHeaders,
          })
          .pipe(
            unpackEnvelope<ShippingMethodData>('data'),
            map(data => data.map(ShippingMethodMapper.fromData))
          )
      : this.currentBasketEndpoint()
          .get('eligible-shipping-methods', {
            headers: this.basketHeaders,
          })
          .pipe(
            unpackEnvelope<ShippingMethodData>('data'),
            map(data => data.map(ShippingMethodMapper.fromData))
          );
  }

  /**
   * Creates a requisition of a certain basket that has to be approved.
   *
   * @param  basketId      Basket id.
   * @returns              nothing
   */
  createRequisition(basketId: string): Observable<void> {
    if (!basketId) {
      return throwError(() => new Error('createRequisition() called without required basketId'));
    }

    return this.orderService.createOrder(basketId, true).pipe(
      concatMap(() => of(undefined)),
      catchError(err => {
        if (err.status === 422) {
          return of(undefined);
        }
        return throwError(() => err);
      })
    );
  }

  /**
   * Updates the desired delivery date at all those line items of the current basket, whose desired delivery date differs from the given date.
   *
   * @param  desiredDeliveryDate      Desired delivery date in iso format, i.e. yyyy-mm-dd.
   * @param lineItems                 Array of basket line items
   * @returns                         Array of updated line items and basket
   */
  updateBasketItemsDesiredDeliveryDate(
    desiredDeliveryDate: string,
    lineItems: LineItemView[]
  ): Observable<{ lineItem: LineItem; info: BasketInfo[] }[]> {
    if (desiredDeliveryDate && !new RegExp(/\d{4}-\d{2}-\d{2}/).test(desiredDeliveryDate)) {
      return throwError(
        () => new Error('updateBasketItemsDesiredDeliveryDate() called with an invalid desiredDeliveryDate')
      );
    }

    const obsArray = lineItems
      ?.filter(item => item.desiredDeliveryDate !== desiredDeliveryDate)
      ?.map(item => this.updateBasketItem(item.id, { desiredDelivery: desiredDeliveryDate }));

    return iif(() => !!obsArray.length, forkJoin(obsArray), of([]));
  }

  /**
   * Creates a custom attribute on the currently used basket. Default attribute type is 'String'.
   *
   * @param attr   The custom attribute
   * @returns      The custom attribute
   */
  createBasketAttribute(attr: Attribute): Observable<Attribute> {
    if (!attr) {
      return throwError(() => new Error('createBasketAttribute() called without attribute'));
    }

    // if no type is provided save it as string
    const attribute = { ...attr, type: attr.type ?? 'String' };

    return this.currentBasketEndpoint().post<Attribute>('attributes', attribute, {
      headers: this.basketHeaders,
    });
  }

  /**
   * Updates a custom attribute on the currently used basket. Default attribute type is 'String'.
   *
   * @param attribute   The custom attribute
   * @returns           The custom attribute
   */
  updateBasketAttribute(attr: Attribute): Observable<Attribute> {
    if (!attr) {
      return throwError(() => new Error('updateBasketAttribute() called without attribute'));
    }

    // if no type is provided save it as string
    const attribute = { ...attr, type: attr.type ?? 'String' };

    return this.currentBasketEndpoint().patch<Attribute>(`attributes/${attribute.name}`, attribute, {
      headers: this.basketHeaders,
    });
  }

  /**
   * Deletes a custom attribute from the currently used basket.
   *
   * @param attributeName The name of the custom attribute
   */
  deleteBasketAttribute(attributeName: string): Observable<unknown> {
    if (!attributeName) {
      return throwError(() => new Error('deleteBasketAttribute() called without attributeName'));
    }
    return this.currentBasketEndpoint().delete(`attributes/${attributeName}`, {
      headers: this.basketHeaders,
    });
  }

  /**
   * Adds all items of a quote to the current basket.
   *
   * @param quoteId   The id of the quote that should be added to the basket.
   * @returns         The info message if present.
   */
  addQuoteToBasket(quoteId: string): Observable<BasketInfo[]> {
    if (!quoteId) {
      return throwError(() => new Error('addQuoteToBasket() called without quoteId'));
    }

    return this.currentBasketEndpoint()
      .post(
        `quotes`,
        { id: quoteId, calculated: true },
        {
          headers: this.basketHeaders,
        }
      )
      .pipe(map(BasketInfoMapper.fromInfo));
  }

  /**
   * Deletes all items of a quote from the current basket.
   *
   * @param quoteId   The id of the quote whose items should be deleted from the basket.
   * @returns         The info message if present.
   */
  deleteQuoteFromBasket(quoteId: string): Observable<BasketInfo[]> {
    if (!quoteId) {
      return throwError(() => new Error('deleteQuoteFromBasket() called without quoteId'));
    }

    return this.currentBasketEndpoint()
      .delete(`quotes/${quoteId}`, {
        headers: this.basketHeaders,
      })
      .pipe(map(BasketInfoMapper.fromInfo));
  }
}
