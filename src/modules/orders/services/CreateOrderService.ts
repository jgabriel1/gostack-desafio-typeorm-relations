import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Product from '@modules/products/infra/typeorm/entities/Product';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists)
      throw new AppError('Invalid customer_id. Customer does not exist.');

    const registeredProducts = await this.productsRepository.findAllById(
      products,
    );

    const registeredProductsIds = registeredProducts.map(({ id }) => id);

    const inexistentProducts = products.filter(
      product => !registeredProductsIds.includes(product.id),
    );

    if (inexistentProducts.length > 0)
      throw new AppError(
        `Products with ids: ${inexistentProducts
          .map(product => product.id)
          .join()}`,
      );

    const insufficientProducts = registeredProducts.reduce<Product[]>(
      (accum, product) => {
        const orderedQuantity = products.find(({ id }) => id === product.id)
          ?.quantity;

        if (!orderedQuantity) return accum;

        if (orderedQuantity > product.quantity) return [...accum, product];

        return accum;
      },
      [],
    );

    if (insufficientProducts.length > 0)
      throw new AppError(
        `Products ${insufficientProducts
          .map(({ name }) => name)
          .join()} have insufficient quantities.`,
      );

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: products.map(product => ({
        product_id: product.id,
        quantity: product.quantity,
        price: registeredProducts.find(({ id }) => id === product.id)
          ?.price as number,
      })),
    });

    await this.productsRepository.updateQuantity(products);

    return order;
  }
}

export default CreateOrderService;
