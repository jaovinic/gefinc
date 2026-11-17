package com.jvtech.gefinc.admin.deletion;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Repositório exclusivo para motivos de exclusão (US11). Não estende JpaRepository para não herdar
 * métodos delete/deleteById/deleteAll, cumprindo o requisito de que motivos nunca são removidos
 * fisicamente (D29).
 */
public interface DeletionReasonRepository extends Repository<DeletionReason, Long> {

  DeletionReason save(DeletionReason reason);

  Optional<DeletionReason> findById(Long id);

  List<DeletionReason> findAllByOrderByIdAsc();

  @Query("SELECT r FROM DeletionReason r WHERE r.active = true ORDER BY r.id ASC")
  List<DeletionReason> findAllActive();

  @Query(
      "SELECT count(r) > 0 FROM DeletionReason r WHERE lower(r.name) = lower(:name)"
          + " AND (:excludeId IS NULL OR r.id <> :excludeId)")
  boolean existsByNameIgnoreCaseExcluding(
      @Param("name") String name, @Param("excludeId") Long excludeId);

  @Query("SELECT count(r) FROM DeletionReason r WHERE r.active = true")
  long countActive();
}
