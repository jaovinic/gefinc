package com.jvtech.gefinc.category;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.transaction.TransactionGroupRepository;
import com.jvtech.gefinc.transaction.TransactionRepository;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CategoryService {

  private final CategoryRepository categories;
  private final TransactionRepository transactions;
  private final TransactionGroupRepository groups;

  public CategoryService(
      CategoryRepository categories,
      TransactionRepository transactions,
      TransactionGroupRepository groups) {
    this.categories = categories;
    this.transactions = transactions;
    this.groups = groups;
  }

  @Transactional(readOnly = true)
  public List<Category> list(long userId, CategoryType type) {
    return type == null
        ? categories.findAllOfUser(userId)
        : categories.findAllOfUserByType(userId, type);
  }

  @Transactional
  public Category create(long userId, String name, CategoryType type, String colorHex) {
    String trimmed = name.strip();
    assertNameFree(userId, type, trimmed, null);
    try {
      return categories.saveAndFlush(new Category(userId, trimmed, type, colorHex));
    } catch (DataIntegrityViolationException e) {
      throw nameTaken();
    }
  }

  @Transactional
  public Category update(long userId, long id, String name, CategoryType type, String colorHex) {
    Category category = get(userId, id);
    if (type != category.getType()) {
      throw ApiException.validation("O tipo da categoria não pode ser alterado.")
          .withFieldError("type", "O tipo da categoria não pode ser alterado.");
    }
    String trimmed = name.strip();
    assertNameFree(userId, category.getType(), trimmed, category.getId());
    category.update(trimmed, colorHex);
    try {
      return categories.saveAndFlush(category);
    } catch (DataIntegrityViolationException e) {
      throw nameTaken();
    }
  }

  /**
   * Exclui a categoria. Em uso, exige {@code reassignTo} (outra categoria do mesmo tipo e do mesmo
   * usuário) e move os lançamentos antes de excluir (FR-016).
   */
  @Transactional
  public void delete(long userId, long id, Long reassignTo) {
    Category category = get(userId, id);
    boolean inUse =
        transactions.existsByCategory(userId, id) || groups.existsByCategory(userId, id);
    if (inUse) {
      if (reassignTo == null) {
        throw new ApiException(
            ErrorCode.CATEGORY_IN_USE,
            "Esta categoria possui lançamentos. Escolha outra categoria para recebê-los.");
      }
      if (reassignTo == id) {
        throw ApiException.validation("Escolha uma categoria diferente da que será excluída.")
            .withFieldError("reassignTo", "Escolha uma categoria diferente.");
      }
      Category target = get(userId, reassignTo);
      if (target.getType() != category.getType()) {
        throw ApiException.validation("A categoria de destino deve ser do mesmo tipo.")
            .withFieldError("reassignTo", "A categoria de destino deve ser do mesmo tipo.");
      }
      transactions.reassignCategory(userId, id, reassignTo);
      groups.reassignCategory(userId, id, reassignTo);
    }
    categories.delete(category);
    categories.flush();
  }

  private Category get(long userId, long id) {
    return categories
        .findByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("Categoria não encontrada."));
  }

  private void assertNameFree(long userId, CategoryType type, String name, Long excludeId) {
    if (categories.nameExists(userId, type, name, excludeId)) {
      throw nameTaken();
    }
  }

  private static ApiException nameTaken() {
    return new ApiException(
        ErrorCode.CATEGORY_NAME_TAKEN, "Já existe uma categoria com este nome.");
  }
}
