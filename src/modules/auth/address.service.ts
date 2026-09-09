import { NotFoundError } from '@/lib/errors';
import { requireOwnership } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import type { AddressInput, UpdateAddressInput } from '@/modules/auth/address.schema';
import * as addressRepository from '@/modules/auth/address.repository';
import type { AddressRecord } from '@/modules/auth/address.repository';

export async function listAddresses(user: SessionUser): Promise<AddressRecord[]> {
  return addressRepository.listAddressesForUser(user.id);
}

export async function addAddress(user: SessionUser, input: AddressInput): Promise<AddressRecord> {
  return addressRepository.createAddress(user.id, input);
}

async function getOwnedAddressOrThrow(
  user: SessionUser,
  addressId: string,
): Promise<AddressRecord> {
  const address = await addressRepository.findAddressById(addressId);
  if (!address) throw new NotFoundError('Address not found.');
  requireOwnership(user, address.userId);
  return address;
}

export async function editAddress(
  user: SessionUser,
  addressId: string,
  input: UpdateAddressInput,
): Promise<AddressRecord> {
  await getOwnedAddressOrThrow(user, addressId);
  return addressRepository.updateAddress(addressId, user.id, input);
}

export async function removeAddress(user: SessionUser, addressId: string): Promise<void> {
  await getOwnedAddressOrThrow(user, addressId);
  await addressRepository.deleteAddress(addressId);
}
